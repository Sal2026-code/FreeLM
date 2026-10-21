/**
 * FreeLM — file upload.
 *
 * POST /api/notebooks/:id/sources/upload   (multipart/form-data)
 *
 * Files are stored, a source row is created, and an ingestion job is queued.
 * There is no limit on the *number* of sources.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema, type SourceType } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, resolveNotebook } from '@/lib/api/helpers';
import { enqueueIngestion } from '@/lib/queue';
import { buildStorageKey, getStorage } from '@/lib/storage';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const EXTENSION_TYPES: Record<string, SourceType> = {
  '.pdf': 'pdf',
  '.txt': 'text',
  '.md': 'text',
  '.csv': 'csv',
  '.docx': 'docx',
  '.pptx': 'pptx',
  '.epub': 'epub',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.bmp': 'image',
  '.heic': 'image',
  '.tif': 'image',
  '.tiff': 'image',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.m4a': 'audio',
  '.aac': 'audio',
  '.ogg': 'audio',
  '.opus': 'audio',
  '.flac': 'audio',
};

function typeForFile(name: string, mimeType: string): SourceType {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const extension = dot === -1 ? '' : lower.slice(dot);
  if (EXTENSION_TYPES[extension]) return EXTENSION_TYPES[extension]!;
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'file';
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

    const form = await request.formData();
    const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return badRequest('Choose at least one file to upload.');
    }

    const maxBytes = env.FREELM_MAX_SOURCE_MB * 1024 * 1024;
    const storage = getStorage();
    const created: unknown[] = [];

    for (const file of files) {
      if (file.size > maxBytes) {
        return badRequest(
          `"${file.name}" is larger than the ${env.FREELM_MAX_SOURCE_MB} MB limit for a single file.`,
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const type = typeForFile(file.name, file.type);

      const [source] = await db
        .insert(schema.sources)
        .values({
          notebookId,
          title: file.name.replace(/\.[^.]+$/, ''),
          type,
          status: 'uploaded',
          progress: 0,
          metadata: {
            originalName: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
          },
        })
        .returning();

      const key = buildStorageKey(notebookId, source!.id, file.name);
      await storage.put(key, buffer, file.type || 'application/octet-stream');

      await db
        .update(schema.sources)
        .set({ storageKey: key })
        .where(eq(schema.sources.id, source!.id));

      await enqueueIngestion({ sourceId: source!.id, notebookId });

      created.push({
        id: source!.id,
        notebookId,
        title: source!.title,
        type: source!.type,
        status: 'uploaded',
        progress: 0,
        error: null,
        metadata: source!.metadata,
        labelIds: [],
        chunkCount: 0,
        createdAt: source!.createdAt.toISOString(),
        updatedAt: source!.updatedAt.toISOString(),
      });
    }

    return NextResponse.json(created);
  } catch (error) {
    return jsonError(error);
  }
}
