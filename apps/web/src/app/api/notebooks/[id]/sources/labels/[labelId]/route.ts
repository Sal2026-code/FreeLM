/**
 * FreeLM — one source label.
 *
 * PATCH  /api/notebooks/:id/sources/labels/:labelId
 * DELETE /api/notebooks/:id/sources/labels/:labelId
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, notFound, resolveNotebook } from '@/lib/api/helpers';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string; labelId: string };
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, labelId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    const body = (await request.json()) as { name?: string; color?: string };
    const patch: Partial<typeof schema.sourceLabels.$inferInsert> = {};
    if (typeof body.name === 'string' && body.name.trim()) {
      patch.name = body.name.trim().slice(0, 60);
    }
    if (typeof body.color === 'string' && body.color.trim()) {
      patch.color = body.color.trim().slice(0, 16);
    }
    if (Object.keys(patch).length === 0) {
      return badRequest('Nothing to change.');
    }

    const [updated] = await db
      .update(schema.sourceLabels)
      .set(patch)
      .where(
        and(
          eq(schema.sourceLabels.id, labelId),
          eq(schema.sourceLabels.notebookId, id),
        ),
      )
      .returning();

    if (!updated) return notFound('That label does not exist.');

    return NextResponse.json({
      id: updated.id,
      notebookId: updated.notebookId,
      name: updated.name,
      color: updated.color,
      sourceCount: 0,
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
    const { id, labelId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    await db
      .delete(schema.sourceLabels)
      .where(
        and(
          eq(schema.sourceLabels.id, labelId),
          eq(schema.sourceLabels.notebookId, id),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
