/**
 * FreeLM — single source.
 *
 * GET    /api/notebooks/:id/sources/:sourceId   read + chunks + guide
 * PATCH  /api/notebooks/:id/sources/:sourceId   rename
 * DELETE /api/notebooks/:id/sources/:sourceId   remove
 */

import { and, asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, notFound, readJson, resolveNotebook } from '@/lib/api/helpers';
import { publishEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string; sourceId: string };
}

async function loadSource(notebookId: string, sourceId: string) {
  const [row] = await db
    .select()
    .from(schema.sources)
    .where(
      and(
        eq(schema.sources.id, sourceId),
        eq(schema.sources.notebookId, notebookId),
      ),
    )
    .limit(1);
  return row;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, sourceId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    const source = await loadSource(id, sourceId);
    if (!source) return notFound('That source does not exist.');

    const chunks = await db
      .select()
      .from(schema.chunks)
      .where(eq(schema.chunks.sourceId, sourceId))
      .orderBy(asc(schema.chunks.chunkIndex));

    const labelRows = await db
      .select({ labelId: schema.sourceLabelMembers.labelId })
      .from(schema.sourceLabelMembers)
      .where(eq(schema.sourceLabelMembers.sourceId, sourceId));

    return NextResponse.json({
      id: source.id,
      notebookId: source.notebookId,
      title: source.title,
      type: source.type,
      status: source.status,
      progress: source.progress,
      error: source.error,
      metadata: (source.metadata ?? {}) as Record<string, unknown>,
      labelIds: labelRows.map((row) => row.labelId),
      chunkCount: chunks.length,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
      guide: source.guide,
      extractedText: source.extractedText,
      chunks: chunks.map((chunk) => ({
        id: chunk.id,
        sourceId: chunk.sourceId,
        chunkIndex: chunk.chunkIndex,
        sectionTitle: chunk.sectionTitle,
        pageNumber: chunk.pageNumber,
        text: chunk.text,
        tokenCount: chunk.tokenCount,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, sourceId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    const body = (await request.json()) as { title?: string };
    if (!body.title?.trim()) {
      return NextResponse.json(
        { error: 'The title cannot be empty.', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(schema.sources)
      .set({ title: body.title.trim().slice(0, 300), updatedAt: new Date() })
      .where(eq(schema.sources.id, sourceId))
      .returning();

    if (!updated) return notFound('That source does not exist.');

    publishEvent(id, {
      type: 'source',
      source: {
        id: updated.id,
        notebookId: updated.notebookId,
        title: updated.title,
        type: updated.type,
        status: updated.status,
        progress: updated.progress,
        error: updated.error,
        metadata: (updated.metadata ?? {}) as Record<string, unknown>,
        labelIds: [],
        chunkCount: 0,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });

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
    const { id, sourceId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    const source = await loadSource(id, sourceId);
    if (!source) return notFound('That source does not exist.');

    if (source.storageKey) {
      const { getStorage } = await import('@/lib/storage');
      await getStorage().remove(source.storageKey);
    }

    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
    publishEvent(id, { type: 'source_removed', sourceId });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
