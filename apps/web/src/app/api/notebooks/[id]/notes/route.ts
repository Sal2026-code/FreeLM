/**
 * FreeLM — notes.
 *
 * GET  /api/notebooks/:id/notes
 * POST /api/notebooks/:id/notes
 */

import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, resolveNotebook } from '@/lib/api/helpers';
import { listNotes } from '@/lib/api/queries';
import { publishEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const resolved = await resolveNotebook(context.params.id, session);
    if (!resolved.ok) return resolved.response;
    return NextResponse.json(await listNotes(context.params.id));
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

    const body = (await request.json()) as {
      title?: string;
      content?: string;
      citationChunkIds?: string[];
    };

    const content = body.content?.trim() ?? '';
    if (!content) return badRequest('The note is empty.');

    const [row] = await db
      .insert(schema.notes)
      .values({
        notebookId,
        title: body.title?.trim() || 'Untitled note',
        content,
        citationChunkIds: body.citationChunkIds ?? [],
      })
      .returning();

    const note = {
      id: row!.id,
      notebookId,
      title: row!.title,
      content: row!.content,
      citationChunkIds: (row!.citationChunkIds ?? []) as string[],
      createdAt: row!.createdAt.toISOString(),
      updatedAt: row!.updatedAt.toISOString(),
    };

    publishEvent(notebookId, { type: 'note', note });
    return NextResponse.json(note);
  } catch (error) {
    return jsonError(error);
  }
}
