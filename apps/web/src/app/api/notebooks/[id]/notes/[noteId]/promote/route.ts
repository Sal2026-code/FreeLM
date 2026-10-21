/**
 * FreeLM — promote a note into a source.
 *
 * POST /api/notebooks/:id/notes/:noteId/promote
 *
 * Notes live alongside sources in the Studio panel. Promoting one turns it
 * into a real, searchable source.
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, notFound, resolveNotebook } from '@/lib/api/helpers';
import { createSource } from '@/lib/api/sources';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  context: { params: { id: string; noteId: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, noteId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    const [note] = await db
      .select()
      .from(schema.notes)
      .where(
        and(
          eq(schema.notes.id, noteId),
          eq(schema.notes.notebookId, id),
        ),
      )
      .limit(1);

    if (!note) return notFound('That note does not exist.');

    const source = await createSource({
      notebookId: id,
      title: note.title,
      type: 'note',
      extractedText: note.content,
      metadata: {
        promotedFromNote: note.id,
        citationChunkIds: note.citationChunkIds ?? [],
      },
    });

    return NextResponse.json(source);
  } catch (error) {
    return jsonError(error);
  }
}
