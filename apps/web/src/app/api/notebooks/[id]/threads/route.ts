/**
 * FreeLM — chat threads.
 *
 * GET  /api/notebooks/:id/threads
 * POST /api/notebooks/:id/threads
 */

import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, resolveNotebook } from '@/lib/api/helpers';
import { listThreads } from '@/lib/api/queries';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const resolved = await resolveNotebook(context.params.id, session);
    if (!resolved.ok) return resolved.response;
    return NextResponse.json(await listThreads(context.params.id));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const notebookId = context.params.id;
    const resolved = await resolveNotebook(notebookId, session);
    if (!resolved.ok) return resolved.response;

    const body = (await request.json().catch(() => ({}))) as { title?: string };

    const [thread] = await db
      .insert(schema.threads)
      .values({
        notebookId,
        title: body.title?.trim() || 'New chat',
      })
      .returning();

    return NextResponse.json({
      id: thread!.id,
      notebookId,
      title: thread!.title,
      messageCount: 0,
      createdAt: thread!.createdAt.toISOString(),
      updatedAt: thread!.updatedAt.toISOString(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
