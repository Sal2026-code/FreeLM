/**
 * FreeLM — share a notebook.
 *
 * POST /api/notebooks/:id/share
 *
 * Creates a share link and marks the notebook public. The notebook then has
 * a read-only public route at /shared/:token.
 */

import { randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, notFound, resolveNotebook } from '@/lib/api/helpers';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const notebookId = context.params.id;
    const resolved = await resolveNotebook(notebookId, session);
    if (!resolved.ok) return resolved.response;

    const token = randomBytes(18).toString('base64url');

    const [share] = await db
      .insert(schema.notebookShares)
      .values({ notebookId, token })
      .returning();

    await db
      .update(schema.notebooks)
      .set({ isPublic: true, updatedAt: new Date() })
      .where(eq(schema.notebooks.id, notebookId));

    return NextResponse.json({
      token: share!.token,
      url: `${env.FREELM_PUBLIC_URL.replace(/\/$/, '')}/shared/${share!.token}`,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const notebookId = context.params.id;
    const resolved = await resolveNotebook(notebookId, session);
    if (!resolved.ok) return resolved.response;

    await db
      .delete(schema.notebookShares)
      .where(eq(schema.notebookShares.notebookId, notebookId));
    await db
      .update(schema.notebooks)
      .set({ isPublic: false, updatedAt: new Date() })
      .where(eq(schema.notebooks.id, notebookId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
