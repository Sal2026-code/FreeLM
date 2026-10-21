/**
 * FreeLM — re-embed chunks.
 *
 * Two uses:
 *   1. Fill in embeddings for chunks that do not have them (for example the
 *      seeded featured notebooks, or sources imported before a key was set).
 *   2. Move to a different embedding model. Because vectors from different
 *      models live in different spaces, switching models means every vector
 *      has to be regenerated.
 *
 * Run with:
 *   npm run db:reembed --workspace=@freelm/web              # fill gaps only
 *   npm run db:reembed --workspace=@freelm/web -- --force   # re-embed all
 */

import { Client } from 'pg';

import { getEmbeddingProvider } from '../src/lib/ai';
import { env } from '../src/lib/env';

const force = process.argv.includes('--force');
const BATCH_SIZE = 64;

async function main(): Promise<void> {
  const provider = getEmbeddingProvider();
  const modelName = provider.info.embeddingModel;
  const dimension = provider.info.embeddingDim;

  console.log(`[reembed] model=${modelName} dim=${dimension} force=${force}`);

  if (dimension !== env.FREELM_EMBEDDING_DIM) {
    throw new Error(
      `The configured embedding model produces ${dimension}-dimensional vectors but ` +
        `FREELM_EMBEDDING_DIM is ${env.FREELM_EMBEDDING_DIM}. Change FREELM_EMBEDDING_DIM ` +
        `and run a migration before re-embedding.`,
    );
  }

  const client = new Client({ connectionString: env.FREELM_DATABASE_URL });
  await client.connect();

  const missing = await client.query<{ id: string; text: string }>(
    `SELECT c.id, c.text
       FROM chunks c
       LEFT JOIN embeddings e ON e.chunk_id = c.id
      WHERE e.chunk_id IS NULL
      ORDER BY c.source_id, c.chunk_index`,
  );

  const stale = await client.query<{ id: string; text: string }>(
    `SELECT c.id, c.text
       FROM chunks c
       JOIN embeddings e ON e.chunk_id = c.id
      WHERE e.model_name <> $1
      ORDER BY c.source_id, c.chunk_index`,
    [modelName],
  );

  const targets = force ? stale.rows : missing.rows;

  if (targets.length === 0) {
    console.log('[reembed] nothing to do — every chunk already has a current embedding.');
    await client.end();
    return;
  }

  console.log(`[reembed] ${targets.length} chunk(s) to embed`);

  for (let offset = 0; offset < targets.length; offset += BATCH_SIZE) {
    const batch = targets.slice(offset, offset + BATCH_SIZE);
    const vectors = await provider.embed(batch.map((row) => row.text));

    for (const [index, row] of batch.entries()) {
      const vector = vectors[index];
      if (!vector) continue;
      await client.query(
        `INSERT INTO embeddings (chunk_id, vector, model_name)
         VALUES ($1, $2::vector, $3)
         ON CONFLICT (chunk_id) DO UPDATE
           SET vector = EXCLUDED.vector, model_name = EXCLUDED.model_name`,
        [row.id, `[${vector.join(',')}]`, modelName],
      );
    }

    console.log(
      `[reembed] ${Math.min(offset + BATCH_SIZE, targets.length)}/${targets.length}`,
    );
  }

  await client.end();
  console.log('[reembed] done');
}

main().catch((error) => {
  console.error('[reembed] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
