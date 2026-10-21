/**
 * FreeLM — retry a failed source ingestion.
 *
 * POST /api/notebooks/:id/sources/:sourceId/retry
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, notFound, resolveNotebook } from '@/lib/api/helpers';
import { enqueueIngestion } from '@/lib/queue';
import { publishEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  context: { params: { id: string; sourceId: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, sourceId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    const [source] = await db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, sourceId))
      .limit(1);

    if (!source) return notFound('That source does not exist.');

    const [updated] = await db
      .update(schema.sources)
      .set({ status: 'uploaded', progress: 0, error: null, updatedAt: new Date() })
      .where(eq(schema.sources.id, sourceId))
      .returning();

    await enqueueIngestion({ sourceId, notebookId: id });

    publishEvent(id, {
      type: 'source',
      source: {
        id: updated!.id,
        notebookId: updated!.notebookId,
        title: updated!.title,
        type: updated!.type,
        status: updated!.status,
        progress: updated!.progress,
        error: updated!.error,
        metadata: (updated!.metadata ?? {}) as Record<string, unknown>,
        labelIds: [],
        chunkCount: 0,
        createdAt: updated!.createdAt.toISOString(),
        updatedAt: updated!.updatedAt.toISOString(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return jsonError(error);
  }
}
