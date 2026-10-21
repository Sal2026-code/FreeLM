/**
 * FreeLM — a single note.
 *
 * PATCH  /api/notebooks/:id/notes/:noteId
 * DELETE /api/notebooks/:id/notes/:noteId
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, notFound, resolveNotebook } from '@/lib/api/helpers';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string; noteId: string };
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, noteId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    const body = (await request.json()) as {
      title?: string;
      content?: string;
    };

    const patch: Partial<typeof schema.notes.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (typeof body.title === 'string' && body.title.trim()) {
      patch.title = body.title.trim().slice(0, 200);
    }
    if (typeof body.content === 'string') {
      patch.content = body.content;
    }

    const [row] = await db
      .update(schema.notes)
      .set(patch)
      .where(
        and(
          eq(schema.notes.id, noteId),
          eq(schema.notes.notebookId, id),
        ),
      )
      .returning();

    if (!row) return notFound('That note does not exist.');

    return NextResponse.json({
      id: row.id,
      notebookId: row.notebookId,
      title: row.title,
      content: row.content,
      citationChunkIds: (row.citationChunkIds ?? []) as string[],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
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
    const { id, noteId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    await db
      .delete(schema.notes)
      .where(
        and(
          eq(schema.notes.id, noteId),
          eq(schema.notes.notebookId, id),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
