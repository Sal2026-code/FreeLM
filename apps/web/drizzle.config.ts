import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  connectionString:
    process.env.FREELM_DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/freelm',
} satisfies Config;