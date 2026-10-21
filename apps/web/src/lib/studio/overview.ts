/**
 * FreeLM — notebook overview.
 *
 * The pinned card at the top of the Chat pane: a short summary of what the
 * notebook's sources contain, plus 3-6 suggested questions derived strictly
 * from the sources.
 *
 * It is generated automatically the first time a source becomes ready, and
 * can be regenerated at any time.
 */

import { eq } from 'drizzle-orm';

import { getChatProvider } from '@/lib/ai';
import { generateStructured } from '@/lib/ai/provider';
import { z } from 'zod';

import { buildOverviewPrompt, buildSuggestedQuestionsPrompt } from '@/lib/ai/prompts';
import { db, schema } from '@/lib/db';
import { publishEvent } from '@/lib/events';
import { renderContext, sourceNames } from '@/lib/rag/context';
import { retrieveCoverageChunks } from '@/lib/rag/retrieval';
import { parseCitations } from '@freelm/shared';
import type { Citation, NotebookOverview } from '@freelm/shared';

const questionsSchema = z.object({
  questions: z.array(z.string()).default([]),
});

export interface OverviewResult {
  /** The summary with citation markers removed. */
  content: string;
  /** The summary exactly as the model wrote it (markers intact). */
  raw: string;
  citations: Citation[];
  suggestedQuestions: string[];
}

/**
 * Build the overview for a notebook.
 */
export async function generateOverview(
  notebookId: string,
): Promise<OverviewResult> {
  const chunks = await retrieveCoverageChunks({
    notebookId,
    perSource: 5,
    maxTotal: 30,
  });

  if (chunks.length === 0) {
    return { content: '', raw: '', citations: [], suggestedQuestions: [] };
  }

  const context = renderContext(chunks);
  const names = sourceNames(chunks);
  const provider = getChatProvider();

  const [settings] = await db
    .select({ language: schema.notebookSettings.outputLanguage })
    .from(schema.notebookSettings)
    .where(eq(schema.notebookSettings.notebookId, notebookId))
    .limit(1);

  const language = settings?.language ?? 'en';

  // 1. Summary
  const rawSummary = await provider.chat(
    [
      {
        role: 'user',
        content: buildOverviewPrompt({ context, sourceNames: names, language }),
      },
    ],
    { temperature: 0.5, maxTokens: 900 },
  );

  const parsed = parseCitations(rawSummary);
  const allowed = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  const citations: Citation[] = parsed.citations.flatMap((citation) => {
    const chunk = allowed.get(citation.chunkId);
    if (!chunk) return [];
    return [
      {
        id: chunk.id,
        chunkId: chunk.id,
        sourceId: chunk.sourceId,
        sourceTitle: chunk.sourceTitle,
        chunkLabel: `Chunk ${chunk.chunkIndex + 1}`,
        quote: citation.quote || chunk.text.slice(0, 240),
        pageNumber: chunk.pageNumber,
        sectionTitle: chunk.sectionTitle,
      } satisfies Citation,
    ];
  });

  // 2. Suggested questions
  let suggestedQuestions: string[] = [];
  try {
    const parsedQuestions = await generateStructured(
      provider,
      [
        {
          role: 'user',
          content: buildSuggestedQuestionsPrompt({ context, language }),
        },
      ],
      { validate: (value) => questionsSchema.parse(value) },
    );
    suggestedQuestions = parsedQuestions.questions
      .map((question) => question.trim())
      .filter(Boolean)
      .slice(0, 6);
  } catch {
    // Suggested questions are a nice-to-have; the overview still works.
    suggestedQuestions = [];
  }

  return {
    content: parsed.text,
    raw: rawSummary,
    citations,
    suggestedQuestions,
  };
}

/**
 * Regenerate and persist the overview, then broadcast it.
 */
export async function refreshOverview(
  notebookId: string,
): Promise<NotebookOverview> {
  const result = await generateOverview(notebookId);

  const [row] = await db
    .insert(schema.notebookOverviews)
    .values({
      notebookId,
      content: result.raw,
      citations: result.citations,
      suggestedQuestions: result.suggestedQuestions,
    })
    .onConflictDoUpdate({
      target: schema.notebookOverviews.notebookId,
      set: {
        content: result.raw,
        citations: result.citations,
        suggestedQuestions: result.suggestedQuestions,
        updatedAt: new Date(),
      },
    })
    .returning();

  const overview: NotebookOverview = {
    notebookId,
    content: row?.content ?? result.raw,
    citations: result.citations,
    suggestedQuestions: result.suggestedQuestions,
    updatedAt: (row?.updatedAt ?? new Date()).toISOString(),
  };

  publishEvent(notebookId, { type: 'overview', overview });
  return overview;
}

/** Read the stored overview, if there is one. */
export async function getStoredOverview(
  notebookId: string,
): Promise<NotebookOverview | null> {
  const [row] = await db
    .select()
    .from(schema.notebookOverviews)
    .where(eq(schema.notebookOverviews.notebookId, notebookId))
    .limit(1);

  if (!row) return null;

  return {
    notebookId: row.notebookId,
    content: row.content,
    citations: (row.citations ?? []) as Citation[],
    suggestedQuestions: row.suggestedQuestions ?? [],
    updatedAt: row.updatedAt.toISOString(),
  };
}
