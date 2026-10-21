/**
 * FreeLM — ingestion worker.
 *
 * Run with:  npm run worker --workspace=@freelm/web
 *
 * A separate process from the Next.js server so that a long-running
 * extraction never blocks a UI request.
 */

import { Worker } from 'bullmq';

import { env } from '@/lib/env';
import { INGESTION_QUEUE, type IngestionJobData } from '@/lib/queue';
import { ingestSource } from '@/lib/queue/ingestion';

const worker = new Worker<IngestionJobData>(
  INGESTION_QUEUE,
  async (job) => {
    const { sourceId, notebookId } = job.data;
    const outcome = await ingestSource(sourceId, notebookId);
    if (!outcome.ok) {
      // The pipeline already recorded the error on the source row, so the job
      // itself succeeds — retrying a deterministic failure is pointless.
      return { ...outcome, failed: true };
    }
    return outcome;
  },
  {
    connection: {
      url: env.FREELM_REDIS_URL,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
    concurrency: 3,
  },
);

worker.on('completed', (job, result) => {
  console.log(`[ingest] ${job.id} completed`, result);
});

worker.on('failed', (job, error) => {
  console.error(`[ingest] ${job?.id ?? 'unknown'} failed:`, error.message);
});

console.log('[ingest] FreeLM ingestion worker started');

async function shutdown(): Promise<void> {
  console.log('[ingest] shutting down…');
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
