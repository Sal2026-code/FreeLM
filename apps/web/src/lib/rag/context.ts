/**
 * FreeLM — grounding context + citation validation.
 *
 * `renderContext` turns retrieved chunks into the CONTEXT block that the
 * model is allowed to use. `validateCitations` is the server-side gate that
 * guarantees a saved answer never contains a citation to a chunk that was
 * not actually retrieved.
 */

import type { Citation } from '@freelm/shared';
import { parseCitations } from '@freelm/shared';

import type { RetrievedChunk } from './retrieval';

/**
 * Render retrieved chunks for the prompt.
 *
 * Each chunk gets a stable header the model can copy into a citation marker:
 *
 *   [C:3f2a9c11-...-8b0e] (Source Title — Chunk 4 — p.12)
 */
export function renderContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return '(No source content was retrieved for this question.)';
  }

  return chunks
    .map((chunk, index) => {
      const page = chunk.pageNumber ? ` — p.${chunk.pageNumber}` : '';
      const section = chunk.sectionTitle
        ? ` — ${chunk.sectionTitle}`
        : '';
      return [
        `[C:${chunk.id}] (${chunk.sourceTitle} — Chunk ${chunk.chunkIndex + 1}${page}${section})`,
        chunk.text.trim(),
      ].join('\n');
    })
    .join('\n\n---\n\n');
}

/** The list of source titles in scope, for disambiguation prompts. */
export function sourceNames(chunks: RetrievedChunk[]): string[] {
  return Array.from(new Set(chunks.map((chunk) => chunk.sourceTitle)));
}

export interface ValidationResult {
  /** The answer with valid markers removed. */
  content: string;
  /** Chunk ids the answer actually cites, in order. */
  citedChunkIds: string[];
  /** Citations to keep, ready for the database. */
  citations: Citation[];
  /** True when the answer made a factual claim but cited nothing. */
  uncited: boolean;
}

/**
 * Validate the citations in a model response.
 *
 * Rules:
 *   1. A marker referring to a chunk outside the retrieved set is dropped.
 *   2. Surviving markers become `Citation` rows.
 *   3. If the answer is substantive but cites nothing, it is flagged
 *      `uncited` so the caller can regenerate or fall back to the
 *      "not available in your sources" answer.
 */
export function validateCitations(
  raw: string,
  retrieved: RetrievedChunk[],
): ValidationResult {
  const allowed = new Map<string, RetrievedChunk>();
  for (const chunk of retrieved) allowed.set(chunk.id, chunk);

  const parsed = parseCitations(raw);

  const citedChunkIds: string[] = [];
  const citations: Citation[] = [];

  for (const parsedCitation of parsed.citations) {
    const chunk = allowed.get(parsedCitation.chunkId);
    if (!chunk) continue; // fabricated or out-of-scope citation — drop it.

    if (!citedChunkIds.includes(chunk.id)) citedChunkIds.push(chunk.id);

    citations.push({
      id: chunk.id,
      chunkId: chunk.id,
      sourceId: chunk.sourceId,
      sourceTitle: chunk.sourceTitle,
      chunkLabel: `Chunk ${chunk.chunkIndex + 1}`,
      quote: parsedCitation.quote || chunk.text.slice(0, 240),
      pageNumber: chunk.pageNumber,
      sectionTitle: chunk.sectionTitle,
    });
  }

  // Strip any marker that survived the model but referenced nothing valid.
  const content = raw.replace(/\[\[C:([A-Za-z0-9_-]{6,64})\]\]/g, (match, id: string) =>
    allowed.has(id) ? '' : '',
  );

  const cleaned = content.replace(/[ \t]{2,}/g, ' ').trim();
  const uncited = citedChunkIds.length === 0 && cleaned.length > 120;

  return { content: cleaned, citedChunkIds, citations, uncited };
}

/**
 * The fallback answer used when the model could not ground its response.
 */
export const NO_SOURCE_ANSWER =
  'That information is not available in your sources. ' +
  'Try asking a more specific question, or add a source that covers this topic.';

/**
 * Detect the "not in sources" refusal so the UI can style it.
 */
export function looksLikeRefusal(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes('not available in your sources') ||
    normalized.includes('not in your sources') ||
    normalized.includes('is not in the sources') ||
    normalized.includes('not mentioned in the sources') ||
    normalized.includes('does not contain information') ||
    normalized.includes("doesn't contain") ||
    normalized.includes('no information about')
  );
}
