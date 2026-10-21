/**
 * FreeLM — database client.
 *
 * A single pooled `pg` connection is shared across the app. Next.js hot
 * reloads would otherwise open a new pool on every edit, so the pool is
 * cached on `globalThis`.
 */

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '@/lib/env';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  freelmPool?: Pool;
  freelmDb?: Database;
};

function createPool(): Pool {
  return new Pool({
    connectionString: env.FREELM_DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export const pool: Pool = globalForDb.freelmPool ?? createPool();
if (process.env.NODE_ENV !== 'production') globalForDb.freelmPool = pool;

export const db: Database = globalForDb.freelmDb ?? drizzle(pool, { schema });
if (process.env.NODE_ENV !== 'production') globalForDb.freelmDb = db;

export { schema };
export type {
  SourceRow,
  SourceType,
  ThreadRow,
  NotebookRow,
  StudioOutputRow,
  NoteRow,
  ChunkRow,
} from './schema';
