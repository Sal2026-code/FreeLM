/**
 * FreeLM — global search.
 *
 * GET /api/search?q=...
 *
 * Searches notebooks, sources and notes the caller can reach.
 */

import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError } from '@/lib/api/helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';

    if (query.length < 2) return NextResponse.json({ results: [] });

    const pattern = `%${query}%`;

    // A notebook belongs to the caller when it is on their account, or when
    // it was created by their session. A guest session only ever owns the
    // notebooks it created — matching a null owner would leak other guests'
    // notebooks, so it is deliberately not used.
    const ownsNotebook = (
      session.userId
        ? or(
            eq(schema.notebooks.ownerUserId, session.userId),
            eq(schema.notebooks.sessionId, session.id),
          )
        : eq(schema.notebooks.sessionId, session.id)
    )!;

    const notebookRows = await db
      .select({
        id: schema.notebooks.id,
        title: schema.notebooks.title,
        icon: schema.notebooks.icon,
      })
      .from(schema.notebooks)
      .where(and(ownsNotebook, ilike(schema.notebooks.title, pattern)))
      .orderBy(desc(schema.notebooks.updatedAt));

    const sourceRows = await db
      .select({
        id: schema.sources.id,
        notebookId: schema.sources.notebookId,
        title: schema.sources.title,
      })
      .from(schema.sources)
      .innerJoin(schema.notebooks, eq(schema.notebooks.id, schema.sources.notebookId))
      .where(
        and(
          ownsNotebook,
          ilike(schema.sources.title, pattern),
        ),
      )
      .orderBy(desc(schema.sources.updatedAt));

    const noteRows = await db
      .select({
        id: schema.notes.id,
        notebookId: schema.notes.notebookId,
        title: schema.notes.title,
      })
      .from(schema.notes)
      .innerJoin(schema.notebooks, eq(schema.notebooks.id, schema.notes.notebookId))
      .where(
        and(
          ownsNotebook,
          ilike(schema.notes.title, pattern),
        ),
      )
      .orderBy(desc(schema.notes.updatedAt));

    const results = [
      ...notebookRows.map((row) => ({
        id: row.id,
        title: row.title,
        icon: row.icon,
        type: 'notebook' as const,
      })),
      ...sourceRows.map((row) => ({
        id: row.notebookId,
        title: row.title,
        icon: '📄',
        type: 'source' as const,
      })),
      ...noteRows.map((row) => ({
        id: row.notebookId,
        title: row.title,
        icon: '🗒️',
        type: 'note' as const,
      })),
    ];

    return NextResponse.json({ results });
  } catch (error) {
    return jsonError(error);
  }
}
