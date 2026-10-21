/**
 * FreeLM — workspace event stream.
 *
 * GET /api/notebooks/:id/events
 *
 * Server-Sent Events carrying source progress, new studio outputs, overview
 * refreshes and note changes. The stream closes when the client disconnects.
 */

import { NextResponse } from 'next/server';

import { getOrCreateSession } from '@/lib/auth/session';
import { resolveNotebook } from '@/lib/api/helpers';
import { subscribeToNotebook } from '@/lib/events';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(
  request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  const session = await getOrCreateSession();
  const resolved = await resolveNotebook(context.params.id, session);
  if (!resolved.ok) return resolved.response;

  const notebookId = context.params.id;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      send({ type: 'ping' });

      unsubscribe = await subscribeToNotebook(notebookId, send);

      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          /* the client disconnected */
        }
      }, 20_000);

      request.signal.addEventListener('abort', () => {
        if (keepAlive) clearInterval(keepAlive);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      unsubscribe?.();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
