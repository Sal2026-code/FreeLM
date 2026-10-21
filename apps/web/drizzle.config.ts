import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.FREELM_DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/freelm',
  },
  verbose: true,
  strict: true,
} satisfies Config;
