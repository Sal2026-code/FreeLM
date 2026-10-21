/**
 * FreeLM — notebooks API.
 *
 * GET  /api/notebooks   list notebooks (all | mine | featured)
 * POST /api/notebooks   create a notebook
 */

import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, readJson } from '@/lib/api/helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') ?? 'all';
    const search = url.searchParams.get('search')?.trim() ?? '';
    const sort = url.searchParams.get('sort') ?? 'recent';

    const filters = [
      or(
        eq(schema.notebooks.ownerUserId, session.userId ?? '__none__'),
        eq(schema.notebooks.sessionId, session.id),
      )!,
    ];

    if (scope === 'mine') {
      filters.push(sql`true`);
    } else if (scope === 'featured') {
      filters.length = 0;
      filters.push(eq(schema.notebooks.isFeatured, true));
    }

    if (search) {
      filters.push(
        or(
          ilike(schema.notebooks.title, `%${search}%`),
          ilike(schema.notebooks.description, `%${search}%`),
        )!,
      );
    }

    const orderBy =
      sort === 'title'
        ? [asc(schema.notebooks.title)]
        : sort === 'sources'
          ? [desc(sql`(SELECT count(*) FROM sources WHERE sources.notebook_id = notebooks.id)`)]
          : [desc(sql`notebooks.is_pinned`), desc(schema.notebooks.updatedAt)];

    const rows = await db
      .select()
      .from(schema.notebooks)
      .where(and(...filters))
      .orderBy(...orderBy);

    const sourceCounts = await db
      .select({
        notebookId: schema.sources.notebookId,
        total: sql<number>`count(*)`,
        ready: sql<number>`count(*) FILTER (WHERE ${schema.sources.status} = 'ready')`,
      })
      .from(schema.sources)
      .groupBy(schema.sources.notebookId);

    const countMap = new Map(
      sourceCounts.map((row) => [row.notebookId, row]),
    );

    const threadCounts = await db
      .select({
        notebookId: schema.threads.notebookId,
        total: sql<number>`count(*)`,
      })
      .from(schema.threads)
      .groupBy(schema.threads.notebookId);
    const threadMap = new Map(threadCounts.map((row) => [row.notebookId, row.total]));

    const outputCounts = await db
      .select({
        notebookId: schema.studioOutputs.notebookId,
        total: sql<number>`count(*)`,
      })
      .from(schema.studioOutputs)
      .groupBy(schema.studioOutputs.notebookId);
    const outputMap = new Map(outputCounts.map((row) => [row.notebookId, row.total]));

    const notebooks = rows.map((row) => {
      const counts = countMap.get(row.id);
      return {
        id: row.id,
        ownerUserId: row.ownerUserId,
        title: row.title,
        description: row.description,
        icon: row.icon,
        kind: row.kind,
        isFeatured: row.isFeatured,
        isPublic: row.isPublic,
        isPinned: row.isPinned,
        learningGoal: row.learningGoal,
        sourceCount: Number(counts?.total ?? 0),
        readySourceCount: Number(counts?.ready ?? 0),
        threadCount: Number(threadMap.get(row.id) ?? 0),
        outputCount: Number(outputMap.get(row.id) ?? 0),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });

    return NextResponse.json(notebooks);
  } catch (error) {
    return jsonError(error);
  }
}

interface CreateNotebookBody {
  title?: string;
  description?: string;
  icon?: string;
  kind?: 'regular' | 'study';
  learningGoal?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const body = await readJson<CreateNotebookBody>(request);

    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json(
        { error: 'Give the notebook a title.', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const [notebook] = await db
      .insert(schema.notebooks)
      .values({
        title: title.slice(0, 200),
        description: body.description?.trim() || null,
        icon: body.icon?.trim() || '📓',
        kind: body.kind === 'study' ? 'study' : 'regular',
        learningGoal: body.learningGoal?.trim() || null,
        ownerUserId: session.userId,
        sessionId: session.id,
      })
      .returning();

    // Every notebook gets a settings row and an initial chat thread.
    await db.insert(schema.notebookSettings).values({
      notebookId: notebook!.id,
    });

    const [thread] = await db
      .insert(schema.threads)
      .values({ notebookId: notebook!.id, title: 'New chat' })
      .returning();

    return NextResponse.json({
      ...notebook,
      sourceCount: 0,
      readySourceCount: 0,
      threadCount: 1,
      outputCount: 0,
      initialThreadId: thread!.id,
    });
  } catch (error) {
    return jsonError(error);
  }
}
