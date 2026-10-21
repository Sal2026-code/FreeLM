/**
 * FreeLM — label membership.
 *
 * POST /api/notebooks/:id/sources/labels/:labelId/members
 *
 * Body: { sourceIds: string[] }
 *
 * The client sends the *complete* membership, so the route replaces the
 * existing set rather than adding to it.
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, notFound, resolveNotebook } from '@/lib/api/helpers';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: { id: string; labelId: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, labelId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    const body = (await request.json()) as { sourceIds?: string[] };
    const sourceIds = Array.isArray(body.sourceIds)
      ? body.sourceIds.filter((value): value is string => typeof value === 'string')
      : [];

    const [label] = await db
      .select()
      .from(schema.sourceLabels)
      .where(
        and(
          eq(schema.sourceLabels.id, labelId),
          eq(schema.sourceLabels.notebookId, id),
        ),
      )
      .limit(1);
    if (!label) return notFound('That label does not exist.');

    // Replace the membership.
    await db
      .delete(schema.sourceLabelMembers)
      .where(eq(schema.sourceLabelMembers.labelId, labelId));

    if (sourceIds.length > 0) {
      await db
        .insert(schema.sourceLabelMembers)
        .values(sourceIds.map((sourceId) => ({ labelId, sourceId })))
        .onConflictDoNothing();
    }

    return NextResponse.json({ ok: true, sourceIds });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(): Promise<NextResponse> {
  return badRequest('Use POST to update label membership.');
}
