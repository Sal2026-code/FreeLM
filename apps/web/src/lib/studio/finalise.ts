/**
 * FreeLM — persist a finished Studio artifact.
 *
 * Shared by the inline generation route and the background studio worker.
 */

import { eq } from 'drizzle-orm';

import type { StudioOutput } from '@freelm/shared';

import { db, schema } from '@/lib/db';
import { buildStorageKey, getStorage } from '@/lib/storage';
import type { GeneratorResult } from './generators';

export async function finaliseOutput(
  outputId: string,
  result: GeneratorResult,
): Promise<StudioOutput> {
  let fileUrl: string | null = null;
  let fileMime: string | null = null;

  if (result.file) {
    const key = buildStorageKey(
      'outputs',
      outputId,
      `artifact.${result.file.extension}`,
    );
    const stored = await getStorage().put(
      key,
      result.file.buffer,
      result.file.mimeType,
    );
    fileUrl = `/api/files/${stored.key}`;
    fileMime = result.file.mimeType;
  }

  const [updated] = await db
    .update(schema.studioOutputs)
    .set({
      title: result.title,
      content: result.content as never,
      meta: { ...result.meta, status: 'ready' },
      fileUrl,
      fileMime,
      updatedAt: new Date(),
    })
    .where(eq(schema.studioOutputs.id, outputId))
    .returning();

  return {
    id: updated!.id,
    notebookId: updated!.notebookId,
    type: updated!.type,
    title: updated!.title,
    content: updated!.content,
    fileUrl: updated!.fileUrl,
    fileMime: updated!.fileMime,
    meta: (updated!.meta ?? {}) as Record<string, unknown>,
    sourceIds: (updated!.sourceIds ?? []) as string[],
    createdAt: updated!.createdAt.toISOString(),
    updatedAt: updated!.updatedAt.toISOString(),
  };
}
