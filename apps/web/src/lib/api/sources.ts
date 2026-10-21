/**
 * FreeLM — source creation helpers.
 *
 * Shared by the text / web / YouTube / research / note routes so they all
 * create a source row, queue ingestion and broadcast the new source the same
 * way.
 */

import { eq } from 'drizzle-orm';

import type { Source, SourceType } from '@freelm/shared';

import { db, schema } from '@/lib/db';
import { publishEvent } from '@/lib/events';
import { enqueueIngestion } from '@/lib/queue';

export interface CreateSourceInput {
  notebookId: string;
  title: string;
  type: SourceType;
  /** Plain text that is already extracted (pasted text, notes, research). */
  extractedText?: string;
  metadata?: Record<string, unknown>;
  /** Skip the queue when the content is already chunked elsewhere. */
  queue?: boolean;
}

export async function createSource(
  input: CreateSourceInput,
): Promise<Source> {
  const [row] = await db
    .insert(schema.sources)
    .values({
      notebookId: input.notebookId,
      title: input.title.trim().slice(0, 300) || 'Untitled source',
      type: input.type,
      status: input.queue === false ? 'ready' : 'uploaded',
      progress: 0,
      ...(input.extractedText ? { extractedText: input.extractedText } : {}),
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.extractedText ? { preExtracted: true } : {}),
      },
    })
    .returning();

  const source: Source = {
    id: row!.id,
    notebookId: row!.notebookId,
    title: row!.title,
    type: row!.type,
    status: row!.status,
    progress: row!.progress,
    error: row!.error,
    metadata: (row!.metadata ?? {}) as Record<string, unknown>,
    labelIds: [],
    chunkCount: 0,
    createdAt: row!.createdAt.toISOString(),
    updatedAt: row!.updatedAt.toISOString(),
  };

  if (input.queue !== false) {
    await enqueueIngestion({ sourceId: row!.id, notebookId: input.notebookId });
  }

  publishEvent(input.notebookId, { type: 'source', source });
  return source;
}

/** Mark a source as failed with a readable message. */
export async function failSource(
  sourceId: string,
  notebookId: string,
  message: string,
): Promise<void> {
  await db
    .update(schema.sources)
    .set({ status: 'error', error: message, progress: 0, updatedAt: new Date() })
    .where(eq(schema.sources.id, sourceId));

  const [row] = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, sourceId))
    .limit(1);

  if (row) {
    publishEvent(notebookId, {
      type: 'source',
      source: {
        id: row.id,
        notebookId: row.notebookId,
        title: row.title,
        type: row.type,
        status: row.status,
        progress: row.progress,
        error: row.error,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        labelIds: [],
        chunkCount: 0,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  }
}
