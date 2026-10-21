/**
 * FreeLM — event bus.
 *
 * A tiny Redis pub/sub layer that carries workspace events (source progress,
 * new studio outputs, overview refreshes) from the workers to any connected
 * SSE client. When Redis is unavailable the bus degrades to a no-op so the
 * app still works single-process.
 */

import Redis from 'ioredis';

import { env } from '@/lib/env';
import type { WorkspaceEvent } from '@freelm/shared';

const globalForRedis = globalThis as unknown as {
  freelmPub?: Redis;
  freelmSub?: Redis;
};

function createRedis(): Redis {
  return new Redis(env.FREELM_REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
}

export const pub = globalForRedis.freelmPub ?? createRedis();
export const sub = globalForRedis.freelmSub ?? createRedis();
if (process.env.NODE_ENV !== 'production') {
  globalForRedis.freelmPub = pub;
  globalForRedis.freelmSub = sub;
}

// Never let a Redis hiccup crash the process — the event bus is best-effort.
for (const client of [pub, sub]) {
  client.on('error', (error: Error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[events] redis error:', error.message);
    }
  });
}

function channelFor(notebookId: string): string {
  return `freelm:events:notebook:${notebookId}`;
}

/** Publish a workspace event for a notebook. Never throws. */
export function publishEvent(notebookId: string, event: WorkspaceEvent): void {
  try {
    void pub.publish(channelFor(notebookId), JSON.stringify(event));
  } catch {
    /* the bus is best-effort */
  }
}

/**
 * Subscribe to a notebook's event channel.
 * Returns an unsubscribe function.
 */
export async function subscribeToNotebook(
  notebookId: string,
  onEvent: (event: WorkspaceEvent) => void,
): Promise<() => void> {
  const channel = channelFor(notebookId);
  const handler = (raw: string) => {
    try {
      onEvent(JSON.parse(raw) as WorkspaceEvent);
    } catch {
      /* ignore malformed payloads */
    }
  };

  try {
    await sub.subscribe(channel);
    sub.on('message', handler);
  } catch {
    return () => undefined;
  }

  return () => {
    sub.off('message', handler);
    void sub.unsubscribe(channel).catch(() => undefined);
  };
}
