/**
 * FreeLM — vector retrieval.
 *
 * Uses pgvector's cosine distance (`<=>`) over the `embeddings` table.
 * Retrieval is always scoped to a set of source ids so a chat can be limited
 * to "selected sources", and always filtered by the *active* embedding model
 * so two models can coexist in the database without corrupting search.
 */

import { pool } from '@/lib/db';
import { getEmbeddingProvider } from '@/lib/ai';

export interface RetrievedChunk {
  id: string;
  sourceId: string;
  sourceTitle: string;
  chunkIndex: number;
  sectionTitle: string | null;
  pageNumber: number | null;
  text: string;
  tokenCount: number;
  similarity: number;
}

export interface RetrieveOptions {
  notebookId: string;
  /** Limit retrieval to these source ids. Empty means every ready source. */
  sourceIds?: string[];
  /** How many chunks to fetch. */
  limit?: number;
  /** Override the embedding model (defaults to the configured one). */
  modelName?: string;
  signal?: AbortSignal;
}

/** Format a JS number array as a pgvector literal. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => value.toFixed(6)).join(',')}]`;
}

/**
 * Resolve which source ids are in scope.
 *
 * When no explicit selection is given, every `ready` source in the notebook
 * participates.
 */
export async function resolveScope(
  notebookId: string,
  sourceIds?: string[],
): Promise<string[]> {
  if (sourceIds && sourceIds.length > 0) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM sources
        WHERE notebook_id = $1 AND id = ANY($2::uuid[]) AND status = 'ready'`,
      [notebookId, sourceIds],
    );
    return rows.map((row) => row.id);
  }

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM sources WHERE notebook_id = $1 AND status = 'ready'`,
    [notebookId],
  );
  return rows.map((row) => row.id);
}

/**
 * Retrieve the most relevant chunks for a query.
 */
export async function retrieveChunks(
  query: string,
  options: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  const provider = getEmbeddingProvider();
  const modelName = options.modelName ?? provider.info.embeddingModel;
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 40);

  const scope = await resolveScope(options.notebookId, options.sourceIds);
  if (scope.length === 0) return [];

  const [vector] = await provider.embed([query]);
  if (!vector || vector.length === 0) return [];

  const { rows } = await pool.query<
    {
      id: string;
      source_id: string;
      source_title: string;
      chunk_index: number;
      section_title: string | null;
      page_number: number | null;
      text: string;
      token_count: number;
      similarity: number;
    }
  >(
    `SELECT
       c.id,
       c.source_id,
       s.title AS source_title,
       c.chunk_index,
       c.section_title,
       c.page_number,
       c.text,
       c.token_count,
       1 - (e.vector <=> $1::vector) AS similarity
     FROM embeddings e
     JOIN chunks c   ON c.id = e.chunk_id
     JOIN sources s  ON s.id = c.source_id
     WHERE e.model_name = $2
       AND c.source_id = ANY($3::uuid[])
     ORDER BY e.vector <=> $1::vector
     LIMIT $4`,
    [toVectorLiteral(vector), modelName, scope, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    chunkIndex: row.chunk_index,
    sectionTitle: row.section_title,
    pageNumber: row.page_number,
    text: row.text,
    tokenCount: row.token_count,
    similarity: Number(row.similarity),
  }));
}

/**
 * Retrieve a representative spread of chunks across a whole notebook.
 *
 * Used by the Studio tools, which need broad coverage of the material rather
 * than the handful of chunks most relevant to a single question. Chunks are
 * sampled evenly per source so every document is represented.
 */
export async function retrieveCoverageChunks(
  options: {
    notebookId: string;
    sourceIds?: string[];
    perSource?: number;
    maxTotal?: number;
  },
): Promise<RetrievedChunk[]> {
  const scope = await resolveScope(options.notebookId, options.sourceIds);
  if (scope.length === 0) return [];

  const perSource = options.perSource ?? 6;
  const maxTotal = options.maxTotal ?? 40;

  const { rows } = await pool.query<
    {
      id: string;
      source_id: string;
      source_title: string;
      chunk_index: number;
      section_title: string | null;
      page_number: number | null;
      text: string;
      token_count: number;
    }
  >(
    `WITH ranked AS (
       SELECT
         c.id,
         c.source_id,
         s.title AS source_title,
         c.chunk_index,
         c.section_title,
         c.page_number,
         c.text,
         c.token_count,
         ROW_NUMBER() OVER (PARTITION BY c.source_id ORDER BY c.chunk_index) AS rn,
         COUNT(*) OVER (PARTITION BY c.source_id) AS total
       FROM chunks c
       JOIN sources s ON s.id = c.source_id
       WHERE c.source_id = ANY($1::uuid[])
     )
     SELECT * FROM ranked
     WHERE rn <= GREATEST($2::int, CEIL(total::numeric * $2::numeric / 12)::int)
     LIMIT $3`,
    [scope, perSource, maxTotal],
  );

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    chunkIndex: row.chunk_index,
    sectionTitle: row.section_title,
    pageNumber: row.page_number,
    text: row.text,
    tokenCount: row.token_count,
    similarity: 1,
  }));
}
