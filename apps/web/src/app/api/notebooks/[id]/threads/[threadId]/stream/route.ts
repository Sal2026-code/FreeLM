/**
 * FreeLM — streaming chat.
 *
 * POST /api/notebooks/:id/threads/:threadId/stream
 *
 * The response is newline-delimited JSON (not the default SSE framing) so
 * the browser and React Native can both consume it with a plain reader.
 *
 * Frames:
 *   { type: 'token',     token: '...' }
 *   { type: 'citations', citations: [...] }
 *   { type: 'done',      message: {...} }
 *   { type: 'error',     error: '...', code: '...' }
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { resolveNotebook } from '@/lib/api/helpers';
import { askQuestion } from '@/lib/chat/answer';
import { UpstreamError } from '@/lib/ai/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface RouteContext {
  params: { id: string; threadId: string };
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await getOrCreateSession();
  const { id, threadId } = context.params;

  const resolved = await resolveNotebook(id, session);
  if (!resolved.ok) return resolved.response;

  const [thread] = await db
    .select({ id: schema.threads.id })
    .from(schema.threads)
    .where(
      and(
        eq(schema.threads.id, threadId),
        eq(schema.threads.notebookId, id),
      ),
    )
    .limit(1);

  if (!thread) {
    return NextResponse.json(
      { error: 'That chat does not exist.', code: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  const body = (await request.json()) as {
    content?: string;
    mode?: 'exploratory' | 'analytical' | 'study' | 'creative' | 'instructional' | 'synthesis';
    scope?: 'all' | 'selected';
    sourceIds?: string[];
    length?: 'short' | 'medium' | 'long';
  };

  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json(
      { error: 'Type a question first.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  request.signal.addEventListener('abort', () => abortController.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
      };

      try {
        const result = await askQuestion({
          notebookId: id,
          threadId,
          content,
          ...(body.mode ? { mode: body.mode } : {}),
          ...(body.scope ? { scope: body.scope } : {}),
          ...(body.sourceIds ? { sourceIds: body.sourceIds } : {}),
          ...(body.length ? { length: body.length } : {}),
          onToken: (token) => send({ type: 'token', token }),
          signal: abortController.signal,
        });

        send({ type: 'citations', citations: result.assistantMessage.citations });
        send({ type: 'done', message: result.assistantMessage });
      } catch (error) {
        const upstream =
          error instanceof UpstreamError
            ? error
            : new UpstreamError({
                code: 'UNKNOWN',
                message:
                  error instanceof Error ? error.message : 'Chat failed.',
                provider: 'freelm',
                cause: error,
              });
        send({
          type: 'error',
          error: upstream.userMessage,
          code: upstream.code,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
