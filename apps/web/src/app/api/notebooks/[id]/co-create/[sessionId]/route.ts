/**
 * FreeLM — edit a co-creation plan.
 *
 * PATCH /api/notebooks/:id/co-create/:sessionId
 *
 * The Studio panel shows the plan ("Review outline notes" for decks,
 * "Review producer notes" for videos). The user can deselect topics, edit
 * the outline, add feedback and then press Proceed.
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, notFound, resolveNotebook } from '@/lib/api/helpers';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  context: { params: { id: string; sessionId: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, sessionId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    const [row] = await db
      .select()
      .from(schema.coCreationSessions)
      .where(
        and(
          eq(schema.coCreationSessions.id, sessionId),
          eq(schema.coCreationSessions.notebookId, id),
        ),
      )
      .limit(1);
    if (!row) return notFound('That co-creation session does not exist.');

    const patch = (await request.json()) as Record<string, unknown>;
    const merged = { ...(row.plan as Record<string, unknown>), ...patch };

    const [updated] = await db
      .update(schema.coCreationSessions)
      .set({
        plan: merged,
        status: typeof patch.status === 'string' ? patch.status : row.status,
        updatedAt: new Date(),
      })
      .where(eq(schema.coCreationSessions.id, sessionId))
      .returning();

    return NextResponse.json({
      id: updated!.id,
      ...merged,
      status: updated!.status,
    });
  } catch (error) {
    return jsonError(error);
  }
}
