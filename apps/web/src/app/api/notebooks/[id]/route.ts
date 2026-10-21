/**
 * FreeLM — single notebook API.
 *
 * GET    /api/notebooks/:id   read a notebook
 * PATCH  /api/notebooks/:id   rename, change icon, pin, edit description
 * DELETE /api/notebooks/:id   delete a notebook and everything under it
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import {
  badRequest,
  forbidden,
  jsonError,
  notFound,
  readJson,
} from '@/lib/api/helpers';
import { deleteNotebookCascade } from '@/lib/api/queries';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id } = context.params;

    const [notebook] = await db
      .select()
      .from(schema.notebooks)
      .where(eq(schema.notebooks.id, id))
      .limit(1);

    if (!notebook) return notFound('That notebook does not exist.');

    const counts = await pool.query<{
      total: string;
      ready: string;
    }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE status = 'ready')::text AS ready
         FROM sources WHERE notebook_id = $1`,
      [id],
    );

    const threadCount = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM threads WHERE notebook_id = $1`,
      [id],
    );
    const outputCount = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM studio_outputs WHERE notebook_id = $1`,
      [id],
    );

    const owns =
      (notebook.ownerUserId && notebook.ownerUserId === session.userId) ||
      notebook.sessionId === session.id;

    return NextResponse.json({
      id: notebook.id,
      ownerUserId: notebook.ownerUserId,
      title: notebook.title,
      description: notebook.description,
      icon: notebook.icon,
      kind: notebook.kind,
      isFeatured: notebook.isFeatured,
      isPublic: notebook.isPublic,
      isPinned: notebook.isPinned,
      learningGoal: notebook.learningGoal,
      sourceCount: Number(counts.rows[0]?.total ?? 0),
      readySourceCount: Number(counts.rows[0]?.ready ?? 0),
      threadCount: Number(threadCount.rows[0]?.total ?? 0),
      outputCount: Number(outputCount.rows[0]?.total ?? 0),
      createdAt: notebook.createdAt.toISOString(),
      updatedAt: notebook.updatedAt.toISOString(),
      canEdit: Boolean(owns),
    });
  } catch (error) {
    return jsonError(error);
  }
}

interface PatchBody {
  title?: string;
  description?: string | null;
  icon?: string;
  isPinned?: boolean;
  isPublic?: boolean;
  learningGoal?: string | null;
  kind?: 'regular' | 'study';
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id } = context.params;
    const body = await readJson<PatchBody>(request);

    const [notebook] = await db
      .select()
      .from(schema.notebooks)
      .where(eq(schema.notebooks.id, id))
      .limit(1);

    if (!notebook) return notFound('That notebook does not exist.');

    const owns =
      (notebook.ownerUserId && notebook.ownerUserId === session.userId) ||
      notebook.sessionId === session.id;
    if (!owns) return forbidden('You can only edit notebooks you own.');

    const patch: Partial<typeof schema.notebooks.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (typeof body.title === 'string' && body.title.trim()) {
      patch.title = body.title.trim().slice(0, 200);
    }
    if (body.description !== undefined) {
      patch.description = body.description?.trim() || null;
    }
    if (typeof body.icon === 'string' && body.icon.trim()) {
      patch.icon = body.icon.trim().slice(0, 8);
    }
    if (typeof body.isPinned === 'boolean') patch.isPinned = body.isPinned;
    if (typeof body.isPublic === 'boolean') patch.isPublic = body.isPublic;
    if (body.learningGoal !== undefined) {
      patch.learningGoal = body.learningGoal?.trim() || null;
    }
    if (body.kind === 'regular' || body.kind === 'study') patch.kind = body.kind;

    const [updated] = await db
      .update(schema.notebooks)
      .set(patch)
      .where(eq(schema.notebooks.id, id))
      .returning();

    return NextResponse.json(updated);
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
    const { id } = context.params;

    const [notebook] = await db
      .select()
      .from(schema.notebooks)
      .where(eq(schema.notebooks.id, id))
      .limit(1);

    if (!notebook) return notFound('That notebook does not exist.');

    const owns =
      (notebook.ownerUserId && notebook.ownerUserId === session.userId) ||
      notebook.sessionId === session.id;
    if (!owns) return forbidden('You can only delete notebooks you own.');

    await deleteNotebookCascade(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(): Promise<NextResponse> {
  return badRequest('Use PATCH to update a notebook.');
}
