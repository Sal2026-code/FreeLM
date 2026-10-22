import { pool } from '../src/lib/db';
import { retrieveChunks } from '../src/lib/rag/retrieval';

const notebookId = process.argv[2] ?? '';
const query = process.argv[3] ?? 'chunking preserves context across boundaries';

if (!notebookId) {
  console.error('usage: tsx scripts/check-retrieval.ts <notebookId> [query]');
  process.exit(1);
}

async function main(): Promise<void> {
  const scope = await pool.query<{ id: string; title: string }>(
    `SELECT id, title FROM sources WHERE notebook_id = $1 AND status = 'ready'`,
    [notebookId],
  );
  console.log(
    'ready sources:',
    scope.rows.map((r) => r.title).join(', '),
  );

  const chunks = await retrieveChunks(query, { notebookId, limit: 5 });
  console.log(`\nquery: "${query}"`);
  console.log(`retrieved ${chunks.length} chunks\n`);
  for (const chunk of chunks) {
    console.log(
      `  sim=${chunk.similarity.toFixed(4)}  ${chunk.sourceTitle} / chunk ${chunk.chunkIndex + 1}`,
    );
    console.log(
      `    "${chunk.text.slice(0, 140).replace(/\s+/g, ' ')}..."\n`,
    );
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
