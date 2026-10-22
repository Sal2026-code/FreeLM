/**
 * FreeLM — ingestion pipeline.
 *
 * Runs inside a BullMQ worker:
 *   uploaded → extracting → chunking → embedding → ready
 *
 * Each transition updates the source row and publishes a workspace event so
 * the Sources pane shows live progress. A failure sets `status = 'error'`
 * with a human-readable message and a Retry action.
 */

import { eq, sql } from 'drizzle-orm';

import { getEmbeddingProvider } from '@/lib/ai';
import { chunkDocument } from '@/lib/ai/chunking';
import { db, schema } from '@/lib/db';
import { publishEvent } from '@/lib/events';
import { getStorage } from '@/lib/storage';
import {
  extractAudio,
  extractDocx,
  extractEpub,
  extractImageOcr,
  extractPdf,
  extractPlainText,
  extractPptx,
  extractSpreadsheet,
  extractWebPage,
  extractYouTube,
  looksBinary,
  type ExtractedDocument,
} from '@/lib/ingest/extract';

export interface IngestionOutcome {
  sourceId: string;
  chunkCount: number;
  ok: boolean;
  error?: string;
}

async function setStatus(
  sourceId: string,
  notebookId: string,
  status: 'extracting' | 'chunking' | 'embedding' | 'ready' | 'error',
  progress: number,
  error?: string,
): Promise<void> {
  await db
    .update(schema.sources)
    .set({
      status,
      progress,
      ...(error !== undefined ? { error } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.sources.id, sourceId));

  const [row] = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, sourceId))
    .limit(1);

  if (row) {
    publishEvent(notebookId, { type: 'source', source: serializeSource(row) });
  }
}

/** Convert a source row into the shape the API returns. */
export function serializeSource(row: typeof schema.sources.$inferSelect) {
  return {
    id: row.id,
    notebookId: row.notebookId,
    title: row.title,
    type: row.type,
    status: row.status,
    progress: row.progress,
    error: row.error,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    labelIds: [] as string[],
    chunkCount: 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Run the whole pipeline for one source.
 */
export async function ingestSource(
  sourceId: string,
  notebookId: string,
): Promise<IngestionOutcome> {
  const [source] = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, sourceId))
    .limit(1);

  if (!source) {
    return { sourceId, chunkCount: 0, ok: false, error: 'Source not found.' };
  }

  try {
    // --- 1. Extract ---------------------------------------------------------
    await setStatus(sourceId, notebookId, 'extracting', 15);

    const document = await extractSourceText(source);
    const text = document.text.trim();

    if (!text) {
      throw new Error(
        'No readable text was found in this source. If it is a scanned document, try uploading a text-based version.',
      );
    }

    await db
      .update(schema.sources)
      .set({
        extractedText: text,
        metadata: {
          ...(source.metadata ?? {}),
          ...(document.metadata ?? {}),
          ...(document.pageCount ? { pageCount: document.pageCount } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.sources.id, sourceId));

    // --- 2. Chunk -----------------------------------------------------------
    await setStatus(sourceId, notebookId, 'chunking', 45);

    const rawChunks = chunkDocument({
      text,
      pageNumber: document.pageCount && document.pageCount > 0 ? 1 : null,
    });

    // Map each chunk onto the page it came from, when the extractor gave us
    // page boundaries.
    const pageChunks = pageAwareChunks(document, rawChunks);

    await db.delete(schema.chunks).where(eq(schema.chunks.sourceId, sourceId));

    if (pageChunks.length > 0) {
      // A large source can produce tens of thousands of chunks. Inserting them
      // in one statement builds a multi-megabyte query string, which overflows
      // the stack — so they go in in batches.
      const INSERT_BATCH = 500;
      for (let offset = 0; offset < pageChunks.length; offset += INSERT_BATCH) {
        const batch = pageChunks.slice(offset, offset + INSERT_BATCH);
        await db.insert(schema.chunks).values(
          batch.map((chunk) => ({
            sourceId,
            chunkIndex: chunk.chunkIndex,
            sectionTitle: chunk.sectionTitle,
            pageNumber: chunk.pageNumber,
            text: chunk.text,
            tokenCount: chunk.tokenCount,
            charStart: chunk.charStart,
            charEnd: chunk.charEnd,
          })),
        );
      }
    }

    // --- 3. Embed -----------------------------------------------------------
    await setStatus(sourceId, notebookId, 'embedding', 70);

    const chunkRows = await db
      .select({ id: schema.chunks.id, text: schema.chunks.text })
      .from(schema.chunks)
      .where(eq(schema.chunks.sourceId, sourceId))
      .orderBy(schema.chunks.chunkIndex);

    if (chunkRows.length > 0) {
      const provider = getEmbeddingProvider();
      const modelName = provider.info.embeddingModel;
      const batchSize = 64;

      for (let i = 0; i < chunkRows.length; i += batchSize) {
        const batch = chunkRows.slice(i, i + batchSize);
        const vectors = await provider.embed(batch.map((row) => row.text));

        await db
          .insert(schema.embeddings)
          .values(
            batch.map((row, rowIndex) => ({
              chunkId: row.id,
              vector: vectors[rowIndex] ?? [],
              modelName,
            })),
          )
          .onConflictDoUpdate({
            target: schema.embeddings.chunkId,
            set: {
              vector: sql`excluded.vector`,
              modelName: sql`excluded.model_name`,
            },
          });
      }
    }

    // --- 4. Ready -----------------------------------------------------------
    await setStatus(sourceId, notebookId, 'ready', 100);

    return { sourceId, chunkCount: pageChunks.length, ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected ingestion error.';
    await setStatus(sourceId, notebookId, 'error', 0, message);
    return { sourceId, chunkCount: 0, ok: false, error: message };
  }
}

/**
 * Pull the text out of a source, whatever kind it is.
 */
async function extractSourceText(
  source: typeof schema.sources.$inferSelect,
): Promise<ExtractedDocument> {
  const metadata = (source.metadata ?? {}) as Record<string, unknown>;
  const preExtracted = metadata.preExtracted === true;

  // An uploaded file always wins. A `.txt`, `.md` or `.csv` upload has the
  // same type as pasted text, so the presence of a stored file — not the
  // type — decides how the content is read.
  if (source.storageKey) {
    const storage = getStorage();
    const buffer = await storage.get(source.storageKey);
    const fileName =
      (metadata.originalName as string | undefined) ??
      (metadata.mimeType as string | undefined) ??
      'upload';

    if (source.type === 'pdf') return extractPdf(buffer);
    if (source.type === 'docx') return extractDocx(buffer);
    if (source.type === 'pptx') return extractPptx(buffer);
    if (source.type === 'epub') return extractEpub(buffer);
    if (source.type === 'csv') return extractSpreadsheet(buffer, fileName);
    if (source.type === 'image') return extractImageOcr(buffer);
    if (source.type === 'audio') return extractAudio(buffer, fileName);

    // FreeLM accepts any file type, so an unsupported binary has to be
    // reported honestly rather than decoded into mojibake.
    if (looksBinary(buffer)) {
      throw new Error(
        `"${fileName}" was uploaded, but FreeLM could not find readable text in it. ` +
          'It was kept in the notebook, but it cannot be searched or cited. ' +
          'PDF, Office documents, plain text, Markdown, HTML, ePub, images and audio are all supported.',
      );
    }

    return extractPlainText(buffer);
  }

  if (preExtracted && source.extractedText) {
    return {
      text: source.extractedText,
      pageCount: null,
      title: null,
      metadata: {},
    };
  }

  switch (source.type) {
    case 'text':
    case 'note':
    case 'chat_import':
    case 'research':
    case 'ebook': {
      if (!source.extractedText) {
        throw new Error('This source has no text content.');
      }
      return {
        text: source.extractedText,
        pageCount: null,
        title: null,
        metadata: {},
      };
    }

    case 'web': {
      const url = (metadata.url as string | undefined) ?? '';
      if (!url) throw new Error('This web source has no URL.');
      const result = await extractWebPage(url);
      return result.document;
    }

    case 'youtube': {
      const url = (metadata.url as string | undefined) ?? '';
      if (!url) throw new Error('This YouTube source has no URL.');
      const result = await extractYouTube(url);
      return {
        text: result.text,
        pageCount: null,
        title: result.title,
        metadata: {
          ...(result.author ? { author: result.author } : {}),
          videoId: result.videoId,
        },
      };
    }

    default: {
      throw new Error('This source has no uploaded file.');
    }
  }
}

/**
 * Re-attribute chunks to the page they came from when the extractor gave us
 * page boundaries (PDFs).
 */
function pageAwareChunks(
  document: ExtractedDocument,
  chunks: ReturnType<typeof chunkDocument>,
) {
  if (!document.pages || document.pages.length === 0) return chunks;

  return chunks.map((chunk) => {
    const anchor = chunk.text.slice(0, 80);
    const page = document.pages?.find((candidate) =>
      candidate.text.includes(anchor.slice(0, 40)),
    );
    return page ? { ...chunk, pageNumber: page.page } : chunk;
  });
}
