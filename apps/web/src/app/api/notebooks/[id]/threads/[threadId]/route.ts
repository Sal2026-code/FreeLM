/**
 * FreeLM — one chat thread.
 *
 * PATCH  /api/notebooks/:id/threads/:threadId   rename
 * DELETE /api/notebooks/:id/threads/:threadId   delete the thread
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, notFound, resolveNotebook } from '@/lib/api/helpers';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string; threadId: string };
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, threadId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    const body = (await request.json()) as { title?: string };
    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json(
        { error: 'The thread title cannot be empty.', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const [thread] = await db
      .update(schema.threads)
      .set({ title: title.slice(0, 120), updatedAt: new Date() })
      .where(
        and(
          eq(schema.threads.id, threadId),
          eq(schema.threads.notebookId, id),
        ),
      )
      .returning();

    if (!thread) return notFound('That chat does not exist.');

    return NextResponse.json({
      id: thread.id,
      notebookId: thread.notebookId,
      title: thread.title,
      messageCount: 0,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, threadId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    await db
      .delete(schema.threads)
      .where(
        and(
          eq(schema.threads.id, threadId),
          eq(schema.threads.notebookId, id),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
