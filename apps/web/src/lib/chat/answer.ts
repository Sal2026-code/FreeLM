/**
 * FreeLM — chat engine.
 *
 * The full RAG loop for one question:
 *   1. Load the notebook settings and the conversation history.
 *   2. Retrieve the most relevant chunks (scoped to the selection).
 *   3. Build the grounding context and the mode-specific prompt.
 *   4. Call the model.
 *   5. Validate every citation against the retrieved set.
 *   6. If the answer made claims but cited nothing, regenerate once; if it
 *      still fails, fall back to the "not available in your sources" answer.
 *   7. Persist the user message, the assistant message and the citations.
 *   8. Auto-title the thread after the first exchange.
 */

import { and, desc, eq } from 'drizzle-orm';

import type { ChatMode, Citation, Message } from '@freelm/shared';

import { getChatProvider, getTitleModel } from '@/lib/ai';
import {
  buildChatSystemPrompt,
  buildChatUserPrompt,
  buildTitlePrompt,
} from '@/lib/ai/prompts';
import type { ChatMessage } from '@/lib/ai/provider';
import { db, schema } from '@/lib/db';
import { env } from '@/lib/env';
import {
  NO_SOURCE_ANSWER,
  looksLikeRefusal,
  renderContext,
  sourceNames,
  validateCitations,
} from '@/lib/rag/context';
import { retrieveChunks } from '@/lib/rag/retrieval';

export interface AskOptions {
  notebookId: string;
  threadId: string;
  content: string;
  mode?: ChatMode;
  scope?: 'all' | 'selected';
  sourceIds?: string[];
  length?: 'short' | 'medium' | 'long';
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

export interface AskResult {
  userMessage: Message;
  assistantMessage: Message;
  /** True when the model could not ground the answer. */
  refused: boolean;
  threadTitle: string | null;
}

export async function askQuestion(options: AskOptions): Promise<AskResult> {
  const { notebookId, threadId, content } = options;

  // --- Settings ------------------------------------------------------------
  const [settings] = await db
    .select()
    .from(schema.notebookSettings)
    .where(eq(schema.notebookSettings.notebookId, notebookId))
    .limit(1);

  const mode = options.mode ?? settings?.chatMode ?? 'exploratory';
  const length = options.length ?? (settings?.responseLength as 'short' | 'medium' | 'long') ?? 'medium';
  const language = settings?.outputLanguage ?? 'en';
  const customInstructions = settings?.customInstructions ?? '';
  const retrievalK = Math.min(
    Math.max(settings?.retrievalK ?? env.FREELM_RETRIEVAL_K, 4),
    200,
  );

  // --- History -------------------------------------------------------------
  const historyRows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.threadId, threadId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(env.FREELM_HISTORY_TURNS);

  const history = historyRows
    .reverse()
    .map((row) => ({
      role: row.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: row.content,
    }))
    .filter((turn) => turn.role === 'user' || turn.role === 'assistant');

  // --- Retrieval -----------------------------------------------------------
  const scopedSourceIds =
    options.scope === 'selected' ? (options.sourceIds ?? []) : undefined;

  const retrieved = await retrieveChunks(content, {
    notebookId,
    ...(scopedSourceIds ? { sourceIds: scopedSourceIds } : {}),
    limit: retrievalK,
  });

  // --- Persist the user message -------------------------------------------
  const [userRow] = await db
    .insert(schema.messages)
    .values({ threadId, role: 'user', content, mode })
    .returning();

  await db
    .update(schema.threads)
    .set({ updatedAt: new Date() })
    .where(eq(schema.threads.id, threadId));

  const userMessage: Message = {
    id: userRow!.id,
    threadId,
    role: 'user',
    content,
    mode,
    citations: [],
    createdAt: userRow!.createdAt.toISOString(),
  };

  // --- No sources ----------------------------------------------------------
  if (retrieved.length === 0) {
    const assistant = await persistAssistantMessage(
      threadId,
      NO_SOURCE_ANSWER,
      [],
      mode,
    );
    return {
      userMessage,
      assistantMessage: assistant,
      refused: true,
      threadTitle: await maybeAutoTitle(threadId, content),
    };
  }

  // --- Generate ------------------------------------------------------------
  const provider = getChatProvider();
  const context = renderContext(retrieved);
  const names = sourceNames(retrieved);

  const systemPrompt = buildChatSystemPrompt({
    mode,
    length,
    customInstructions,
    language,
  });
  const userPrompt = buildChatUserPrompt({
    mode,
    length,
    customInstructions,
    language,
    question: content,
    context,
    history,
    sourceNames: names,
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let raw = '';
  let validation = validateCitations(raw, retrieved);
  let attempts = 0;

  while (attempts < 2) {
    attempts += 1;

    raw = await provider.chat(messages, {
      temperature: 0.3,
      maxTokens: length === 'long' ? 4000 : 2000,
      ...(options.onToken ? { onToken: options.onToken } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    validation = validateCitations(raw, retrieved);

    if (!validation.uncited) break;

    // The model answered without grounding. Ask it again, more firmly.
    if (attempts === 1) {
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content:
          'That answer did not cite any of the provided chunks. Rewrite it using ONLY the context, and put a [[C:chunkId]] marker after every factual claim. If the context genuinely does not contain the answer, say exactly that and cite nothing.',
      });
    }
  }

  // Still ungrounded after a retry — refuse rather than hallucinate.
  if (validation.uncited && !looksLikeRefusal(validation.content)) {
    const assistant = await persistAssistantMessage(
      threadId,
      NO_SOURCE_ANSWER,
      [],
      mode,
    );
    return {
      userMessage,
      assistantMessage: assistant,
      refused: true,
      threadTitle: await maybeAutoTitle(threadId, content),
    };
  }

  const assistant = await persistAssistantMessage(
    threadId,
    raw,
    validation.citations,
    mode,
  );

  return {
    userMessage,
    assistantMessage: assistant,
    refused: looksLikeRefusal(validation.content),
    threadTitle: await maybeAutoTitle(threadId, content),
  };
}

/**
 * Save the assistant message and its citations.
 *
 * The raw text is stored (citation markers intact) so the client can render
 * each marker as a clickable chip in exactly the right place. The validated
 * citation rows are stored separately for the source viewer.
 */
async function persistAssistantMessage(
  threadId: string,
  content: string,
  citations: Citation[],
  mode: ChatMode,
): Promise<Message> {
  const [row] = await db
    .insert(schema.messages)
    .values({ threadId, role: 'assistant', content, mode })
    .returning();

  if (citations.length > 0) {
    await db.insert(schema.messageCitations).values(
      citations.map((citation) => ({
        messageId: row!.id,
        chunkId: citation.chunkId,
        quote: citation.quote,
      })),
    );
  }

  await db
    .update(schema.threads)
    .set({ updatedAt: new Date() })
    .where(eq(schema.threads.id, threadId));

  return {
    id: row!.id,
    threadId,
    role: 'assistant',
    content,
    mode,
    citations,
    createdAt: row!.createdAt.toISOString(),
  };
}

/**
 * Give a thread a 3-6 word title after its first exchange.
 */
async function maybeAutoTitle(
  threadId: string,
  question: string,
): Promise<string | null> {
  const [thread] = await db
    .select()
    .from(schema.threads)
    .where(eq(schema.threads.id, threadId))
    .limit(1);
  if (!thread || thread.title !== 'New chat') return null;

  const userMessageCount = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.threadId, threadId),
        eq(schema.messages.role, 'user'),
      ),
    );

  if (userMessageCount.length > 2) return null;

  try {
    const provider = getChatProvider();
    const raw = await provider.chat(
      [
        {
          role: 'user',
          content: buildTitlePrompt({
            question,
            language: 'en',
          }),
        },
      ],
      { maxTokens: 40, temperature: 0.2, model: getTitleModel() },
    );

    const title = raw
      .trim()
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/^(Title|Thread)\s*:\s*/i, '')
      .split('\n')[0]!
      .trim()
      .slice(0, 80);

    if (!title) return null;

    await db
      .update(schema.threads)
      .set({ title, updatedAt: new Date() })
      .where(eq(schema.threads.id, threadId));

    return title;
  } catch {
    return null;
  }
}

/**
 * Answer a question that has no user message yet (used by the "ask about my
 * quiz results" feature).
 */
export async function askWithContext(
  options: AskOptions & { systemPreamble?: string },
): Promise<AskResult> {
  return askQuestion(options);
}

/** Load the previous turns of a thread (most recent first). */
export async function loadHistory(
  threadId: string,
  limit = 20,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.threadId, threadId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(limit);

  return rows
    .reverse()
    .map((row) => ({
      role: row.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: row.content,
    }));
}

/** Read a thread's settings-safe mode. */
export async function getThreadMode(threadId: string): Promise<ChatMode | null> {
  const [row] = await db
    .select({ mode: schema.messages.mode })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.threadId, threadId),
        eq(schema.messages.role, 'assistant'),
      ),
    )
    .orderBy(desc(schema.messages.createdAt))
    .limit(1);
  return row?.mode ?? null;
}
