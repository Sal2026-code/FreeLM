/**
 * FreeLM — source labels (auto-categorisation).
 *
 * GET  /api/notebooks/:id/sources/labels
 * POST /api/notebooks/:id/sources/labels
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, resolveNotebook } from '@/lib/api/helpers';
import { listLabels } from '@/lib/api/queries';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const resolved = await resolveNotebook(context.params.id, session);
    if (!resolved.ok) return resolved.response;
    return NextResponse.json(await listLabels(context.params.id));
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

    const body = (await request.json()) as { name?: string; color?: string };
    const name = body.name?.trim();
    if (!name) return badRequest('Give the label a name.');

    const [label] = await db
      .insert(schema.sourceLabels)
      .values({
        notebookId,
        name: name.slice(0, 60),
        color: body.color ?? '#8ab4f8',
      })
      .returning();

    return NextResponse.json({
      id: label!.id,
      notebookId,
      name: label!.name,
      color: label!.color,
      sourceCount: 0,
    });
  } catch (error) {
    return jsonError(error);
  }
}
