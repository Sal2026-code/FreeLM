/**
 * FreeLM — upload a source.
 *
 * POST /api/notebooks/:id/sources/upload   (multipart/form-data)
 *
 * The body is streamed to disk and split into parts on disk, so the server
 * never holds the file in memory. Any file type is accepted and there is no
 * size limit unless the operator sets one.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, resolveNotebook } from '@/lib/api/helpers';
import { enqueueIngestion } from '@/lib/queue';
import { buildStorageKey, getStorage } from '@/lib/storage';
import { env } from '@/lib/env';
import { detectSourceType } from '@/lib/ingest/detect';
import {
  makeTempDir,
  MultipartParser,
  parseBoundary,
  streamToTempFile,
  type UploadedFile,
} from '@/lib/upload/multipart';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** One terabyte, in bytes. */
const TERABYTE = 1024 * 1024 * 1024 * 1024;

export async function POST(
  request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  const session = await getOrCreateSession();
  const notebookId = context.params.id;
  const resolved = await resolveNotebook(notebookId, session);
  if (!resolved.ok) return resolved.response;

  const contentType = request.headers.get('content-type');
  const boundary = parseBoundary(contentType);

  if (!boundary || !request.body) {
    return badRequest(
      'Send the file as multipart/form-data with a "files" field.',
      'NOT_MULTIPART',
    );
  }

  // The operator's ceiling. 0 means unlimited; the default is one terabyte.
  const maxBytes =
    env.FREELM_MAX_SOURCE_BYTES > 0
      ? env.FREELM_MAX_SOURCE_BYTES
      : TERABYTE;

  const tempDir = await makeTempDir();
  let parsed: Awaited<ReturnType<MultipartParser['parse']>> | null = null;

  try {
    // 1. Stream the whole body to disk — never into memory.
    const raw = await streamToTempFile(request.body, tempDir);

    // 2. Split it into parts, still on disk.
    const parser = new MultipartParser({
      rawPath: raw.path,
      boundary,
      tempDir,
      maxFileBytes: maxBytes,
    });
    parsed = await parser.parse();

    if (parsed.files.length === 0) {
      return badRequest('No file was included in the upload.');
    }

    const storage = getStorage();
    const created: unknown[] = [];

    for (const file of parsed.files) {
      const createdSource = await storeFile({
        file,
        notebookId,
        storage,
        maxBytes,
      });
      created.push(createdSource);
    }

    return NextResponse.json(created);
  } catch (error) {
    return jsonError(error);
  } finally {
    await parsed?.cleanup();
    const { rm } = await import('node:fs/promises');
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function storeFile({
  file,
  notebookId,
  storage,
  maxBytes,
}: {
  file: UploadedFile;
  notebookId: string;
  storage: ReturnType<typeof getStorage>;
  maxBytes: number;
}) {
  const meta = detectSourceType(file.filename, file.contentType);

  const [source] = await db
    .insert(schema.sources)
    .values({
      notebookId,
      title: path.basename(file.filename, path.extname(file.filename)) || file.filename,
      type: meta.type,
      status: 'uploaded',
      progress: 0,
      metadata: {
        originalName: file.filename,
        mimeType: file.contentType,
        sizeBytes: file.size,
        detectedType: meta.label,
      },
    })
    .returning();

  const key = buildStorageKey(notebookId, source!.id, file.filename);
  await storage.putFile(key, file.path, file.contentType);

  await db
    .update(schema.sources)
    .set({ storageKey: key })
    .where(eq(schema.sources.id, source!.id));

  await enqueueIngestion({ sourceId: source!.id, notebookId });

  void maxBytes;
  void randomUUID;

  return {
    id: source!.id,
    notebookId,
    title: source!.title,
    type: source!.type,
    status: source!.status,
    progress: source!.progress,
    error: null,
    metadata: (source!.metadata ?? {}) as Record<string, unknown>,
    labelIds: [],
    chunkCount: 0,
    createdAt: source!.createdAt.toISOString(),
    updatedAt: source!.updatedAt.toISOString(),
  };
}
