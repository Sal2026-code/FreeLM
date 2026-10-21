/**
 * FreeLM — global search.
 *
 * GET /api/search?q=...
 *
 * Searches notebooks, sources and notes the caller can reach.
 */

import { and, eq, ilike, or, sql } from 'drizzle-orm';
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

    const notebookRows = await db
      .select({
        id: schema.notebooks.id,
        title: schema.notebooks.title,
        icon: schema.notebooks.icon,
      })
      .from(schema.notebooks)
      .where(
        and(
          or(
            eq(schema.notebooks.ownerUserId, session.userId ?? '__none__'),
            eq(schema.notebooks.sessionId, session.id),
          ),
          ilike(schema.notebooks.title, pattern),
        ),
      )
      .limit(10);

    const sourceRows = await db
      .select({
        id: schema.sources.id,
        notebookId: schema.sources.notebookId,
        title: schema.sources.title,
      })
      .from(schema.sources)
      .where(
        and(
          sql`EXISTS (SELECT 1 FROM notebooks n WHERE n.id = ${schema.sources.notebookId}
                   AND (n.owner_user_id = ${session.userId ?? '__none__'}
                        OR n.session_id = ${session.id}))`,
          ilike(schema.sources.title, pattern),
        ),
      )
      .limit(10);

    const noteRows = await db
      .select({
        id: schema.notes.id,
        notebookId: schema.notes.notebookId,
        title: schema.notes.title,
      })
      .from(schema.notes)
      .where(
        and(
          sql`EXISTS (SELECT 1 FROM notebooks n WHERE n.id = ${schema.notes.notebookId}
                   AND (n.owner_user_id = ${session.userId ?? '__none__'}
                        OR n.session_id = ${session.id}))`,
          ilike(schema.notes.title, pattern),
        ),
      )
      .limit(10);

    const results = [
      ...notebookRows.map((row) => ({
        id: row.id,
        title: row.title,
        icon: row.icon,
        type: 'notebook',
      })),
      ...sourceRows.map((row) => ({
        id: row.notebookId,
        title: row.title,
        icon: '📄',
        type: 'source',
      })),
      ...noteRows.map((row) => ({
        id: row.notebookId,
        title: row.title,
        icon: '🗒️',
        type: 'note',
      })),
    ];

    return NextResponse.json({ results });
  } catch (error) {
    return jsonError(error);
  }
}
