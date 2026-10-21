/**
 * FreeLM — database migration.
 *
 * Creates the pgvector extension and applies every table, enum, index and
 * trigger defined in `drizzle/0000_init.sql`.
 *
 * Run with:  npm run db:migrate --workspace=@freelm/web
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Client } from 'pg';

import { env } from '../src/lib/env';

async function main(): Promise<void> {
  const client = new Client({ connectionString: env.FREELM_DATABASE_URL });
  await client.connect();

  console.log('[migrate] connected');

  await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
  console.log('[migrate] pgvector extension ready');

  const sqlPath = path.join(process.cwd(), 'drizzle', '0000_init.sql');
  const sql = await readFile(sqlPath, 'utf8');

  // Drizzle separates statements with `--> statement-breakpoint`.
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  await client.query('BEGIN');
  try {
    for (const statement of statements) {
      await client.query(statement);
    }
    await client.query('COMMIT');
    console.log(`[migrate] applied ${statements.length} statements`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[migrate] failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
