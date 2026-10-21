/**
 * FreeLM — job queues.
 *
 * BullMQ (Redis) drives two queues:
 *   • ingestion — extract → chunk → embed for a single source
 *   • studio    — generate a Studio artifact (audio, video, deck, quiz …)
 *
 * Studio jobs are separate because they are slow (minutes) and must not
 * block the ingestion pipeline.
 *
 * The queues are created lazily so that importing this module during a
 * Next.js build never opens a socket to Redis.
 */

import { Queue } from 'bullmq';

import { env } from '@/lib/env';

export const INGESTION_QUEUE = 'freelm-ingestion';
export const STUDIO_QUEUE = 'freelm-studio';

export interface IngestionJobData {
  sourceId: string;
  notebookId: string;
}

export interface StudioJobData {
  outputId: string;
  notebookId: string;
  type: string;
}

const globalForQueue = globalThis as unknown as {
  freelmIngestion?: Queue<IngestionJobData>;
  freelmStudio?: Queue<StudioJobData>;
};

function connection() {
  return {
    url: env.FREELM_REDIS_URL,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  } as const;
}

/** The ingestion queue (created on first use). */
export function getIngestionQueue(): Queue<IngestionJobData> {
  if (!globalForQueue.freelmIngestion) {
    globalForQueue.freelmIngestion = new Queue<IngestionJobData>(
      INGESTION_QUEUE,
      { connection: connection() },
    );
  }
  return globalForQueue.freelmIngestion;
}

/** The studio queue (created on first use). */
export function getStudioQueue(): Queue<StudioJobData> {
  if (!globalForQueue.freelmStudio) {
    globalForQueue.freelmStudio = new Queue<StudioJobData>(STUDIO_QUEUE, {
      connection: connection(),
    });
  }
  return globalForQueue.freelmStudio;
}

/**
 * Enqueue an ingestion job.
 */
export async function enqueueIngestion(data: IngestionJobData): Promise<void> {
  await getIngestionQueue().add('ingest', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 4_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}

export async function enqueueStudio(data: StudioJobData): Promise<void> {
  await getStudioQueue().add('generate', data, {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}

/** Close the queues cleanly (used by scripts and tests). */
export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    globalForQueue.freelmIngestion?.close(),
    globalForQueue.freelmStudio?.close(),
  ]);
}
