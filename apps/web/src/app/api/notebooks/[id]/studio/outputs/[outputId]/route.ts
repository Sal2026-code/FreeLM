/**
 * FreeLM — one Studio output.
 *
 * GET    /api/notebooks/:id/studio/outputs/:outputId
 * DELETE /api/notebooks/:id/studio/outputs/:outputId
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, notFound, resolveNotebook } from '@/lib/api/helpers';
import { publishEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string; outputId: string };
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, outputId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    const [row] = await db
      .select()
      .from(schema.studioOutputs)
      .where(
        and(
          eq(schema.studioOutputs.id, outputId),
          eq(schema.studioOutputs.notebookId, id),
        ),
      )
      .limit(1);

    if (!row) return notFound('That output does not exist.');

    return NextResponse.json({
      id: row.id,
      notebookId: row.notebookId,
      type: row.type,
      title: row.title,
      content: row.content,
      fileUrl: row.fileUrl,
      fileMime: row.fileMime,
      meta: (row.meta ?? {}) as Record<string, unknown>,
      sourceIds: (row.sourceIds ?? []) as string[],
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
    const { id, outputId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    const [row] = await db
      .select()
      .from(schema.studioOutputs)
      .where(
        and(
          eq(schema.studioOutputs.id, outputId),
          eq(schema.studioOutputs.notebookId, id),
        ),
      )
      .limit(1);

    if (!row) return notFound('That output does not exist.');

    await db.delete(schema.studioOutputs).where(eq(schema.studioOutputs.id, outputId));
    publishEvent(id, { type: 'output_removed', outputId });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
