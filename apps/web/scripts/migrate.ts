/**
 * FreeLM — database migration.
 *
 * Creates the pgvector extension and applies every table, enum, index and
 * trigger defined in `drizzle/0000_init.sql`.
 *
 * The migration is idempotent: if the schema is already present only the
 * additive steps (new Studio tool types) run.
 *
 * Run with:  npm run db:migrate --workspace=@freelm/web
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Client } from 'pg';

import { env } from '../src/lib/env';

/**
 * Studio tool types added after the initial migration. `ALTER TYPE ... ADD
 * VALUE` cannot run inside a transaction block on older PostgreSQL, so
 * these run first and on their own.
 */
const NEW_STUDIO_TOOL_TYPES = [
  'comparison',
  'contradictions',
  'themes',
  'definitions',
  'rubric',
  'classroom_activities',
  'teaching_script',
  'guided_reading_questions',
  'assessment_questions',
  'dialogue',
];

async function main(): Promise<void> {
  const client = new Client({ connectionString: env.FREELM_DATABASE_URL });
  await client.connect();

  console.log('[migrate] connected');

  await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
  console.log('[migrate] pgvector extension ready');

  // Additive enum values first.
  for (const value of NEW_STUDIO_TOOL_TYPES) {
    await client.query(`ALTER TYPE studio_tool ADD VALUE IF NOT EXISTS '${value}'`);
  }
  console.log(
    `[migrate] ensured ${NEW_STUDIO_TOOL_TYPES.length} studio tool types`,
  );

  // Is the schema already applied?
  const existing = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'notebooks'`,
  );

  if ((existing.rows[0]?.n ?? 0) > 0) {
    console.log('[migrate] schema already applied — nothing else to do.');
    await client.end();
    return;
  }

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
