/**
 * FreeLM — shared read queries.
 *
 * Small, typed helpers the API routes use so the SQL stays in one place.
 */

import { asc, desc, eq, inArray, sql } from 'drizzle-orm';

import type {
  Citation,
  Message,
  Note,
  Source,
  SourceLabel,
  StudioOutput,
  Thread,
} from '@freelm/shared';

import { db, schema, type ThreadRow } from '@/lib/db';

export async function listSources(notebookId: string): Promise<Source[]> {
  const rows = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.notebookId, notebookId))
    .orderBy(asc(schema.sources.createdAt));

  const labelRows = await db
    .select({
      sourceId: schema.sourceLabelMembers.sourceId,
      labelId: schema.sourceLabelMembers.labelId,
    })
    .from(schema.sourceLabelMembers)
    .innerJoin(
      schema.sourceLabels,
      eq(schema.sourceLabels.id, schema.sourceLabelMembers.labelId),
    )
    .where(eq(schema.sourceLabels.notebookId, notebookId));

  const labelMap = new Map<string, string[]>();
  for (const row of labelRows) {
    const list = labelMap.get(row.sourceId) ?? [];
    list.push(row.labelId);
    labelMap.set(row.sourceId, list);
  }

  const chunkCounts = await db
    .select({
      sourceId: schema.chunks.sourceId,
      total: sql<number>`count(*)`,
    })
    .from(schema.chunks)
    .where(
      inArray(
        schema.chunks.sourceId,
        rows.length > 0
          ? rows.map((row) => row.id)
          : ['00000000-0000-0000-0000-000000000000'],
      ),
    )
    .groupBy(schema.chunks.sourceId);
  const chunkMap = new Map(chunkCounts.map((row) => [row.sourceId, Number(row.total)]));

  return rows.map((row) => ({
    id: row.id,
    notebookId: row.notebookId,
    title: row.title,
    type: row.type,
    status: row.status,
    progress: row.progress,
    error: row.error,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    labelIds: labelMap.get(row.id) ?? [],
    chunkCount: chunkMap.get(row.id) ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function listLabels(notebookId: string): Promise<SourceLabel[]> {
  const rows = await db
    .select()
    .from(schema.sourceLabels)
    .where(eq(schema.sourceLabels.notebookId, notebookId))
    .orderBy(asc(schema.sourceLabels.createdAt));

  const memberRows = await db
    .select({ labelId: schema.sourceLabelMembers.labelId })
    .from(schema.sourceLabelMembers);

  const counts = new Map<string, number>();
  for (const row of memberRows) {
    counts.set(row.labelId, (counts.get(row.labelId) ?? 0) + 1);
  }

  return rows.map((row) => ({
    id: row.id,
    notebookId: row.notebookId,
    name: row.name,
    color: row.color,
    sourceCount: counts.get(row.id) ?? 0,
  }));
}

export async function listThreads(notebookId: string): Promise<Thread[]> {
  const rows = await db
    .select()
    .from(schema.threads)
    .where(eq(schema.threads.notebookId, notebookId))
    .orderBy(desc(schema.threads.updatedAt));

  const messageCounts = await db
    .select({
      threadId: schema.messages.threadId,
      total: sql<number>`count(*)`,
    })
    .from(schema.messages)
    .groupBy(schema.messages.threadId);
  const countMap = new Map(messageCounts.map((row) => [row.threadId, Number(row.total)]));

  return rows.map((row) => ({
    id: row.id,
    notebookId: row.notebookId,
    title: row.title,
    messageCount: countMap.get(row.id) ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function listMessages(
  threadId: string,
): Promise<Message[]> {
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.threadId, threadId))
    .orderBy(asc(schema.messages.createdAt));

  if (rows.length === 0) return [];

  const citationRows = await db
    .select({
      id: schema.messageCitations.id,
      messageId: schema.messageCitations.messageId,
      chunkId: schema.messageCitations.chunkId,
      quote: schema.messageCitations.quote,
      chunkIndex: schema.chunks.chunkIndex,
      pageNumber: schema.chunks.pageNumber,
      sectionTitle: schema.chunks.sectionTitle,
      sourceId: schema.sources.id,
      sourceTitle: schema.sources.title,
    })
    .from(schema.messageCitations)
    .innerJoin(schema.chunks, eq(schema.chunks.id, schema.messageCitations.chunkId))
    .innerJoin(schema.sources, eq(schema.sources.id, schema.chunks.sourceId))
    .where(
      inArray(
        schema.messageCitations.messageId,
        rows.map((row) => row.id),
      ),
    );

  const byMessage = new Map<string, Citation[]>();
  for (const row of citationRows) {
    const list = byMessage.get(row.messageId) ?? [];
    list.push({
      id: row.id,
      chunkId: row.chunkId,
      sourceId: row.sourceId,
      sourceTitle: row.sourceTitle,
      chunkLabel: `Chunk ${row.chunkIndex + 1}`,
      quote: row.quote,
      pageNumber: row.pageNumber,
      sectionTitle: row.sectionTitle,
    });
    byMessage.set(row.messageId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    threadId: row.threadId,
    role: row.role,
    content: row.content,
    mode: row.mode,
    citations: byMessage.get(row.id) ?? [],
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listOutputs(notebookId: string): Promise<StudioOutput[]> {
  const rows = await db
    .select()
    .from(schema.studioOutputs)
    .where(eq(schema.studioOutputs.notebookId, notebookId))
    .orderBy(desc(schema.studioOutputs.createdAt));

  return rows.map((row) => ({
    id: row.id,
    notebookId: row.notebookId,
    type: row.type,
    title: row.title,
    content: row.content,
    fileUrl: row.fileUrl,
    fileMime: row.fileMime,
    meta: (row.meta ?? {}) as Record<string, unknown>,
    sourceIds: (row.sourceIds ?? []) as string[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function listNotes(notebookId: string): Promise<Note[]> {
  const rows = await db
    .select()
    .from(schema.notes)
    .where(eq(schema.notes.notebookId, notebookId))
    .orderBy(desc(schema.notes.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    notebookId: row.notebookId,
    title: row.title,
    content: row.content,
    citationChunkIds: (row.citationChunkIds ?? []) as string[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** Ensure the notebook has at least one thread and return the active one. */
export async function ensureActiveThread(
  notebookId: string,
): Promise<ThreadRow> {
  const threads = await listThreads(notebookId);
  if (threads.length > 0) {
    const first = threads[0];
    const [row] = await db
      .select()
      .from(schema.threads)
      .where(eq(schema.threads.id, first!.id))
      .limit(1);
    if (row) return row;
  }

  const [created] = await db
    .insert(schema.threads)
    .values({ notebookId, title: 'New chat' })
    .returning();
  return created!;
}

/** Mark a thread as the most recently updated. */
export async function touchThread(threadId: string): Promise<void> {
  await db
    .update(schema.threads)
    .set({ updatedAt: new Date() })
    .where(eq(schema.threads.id, threadId));
}

/** Delete a notebook and everything under it. */
export async function deleteNotebookCascade(notebookId: string): Promise<void> {
  const { pool } = await import('@/lib/db');
  await pool.query('DELETE FROM notebooks WHERE id = $1', [notebookId]);
}
