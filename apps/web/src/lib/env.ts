/**
 * FreeLM — environment configuration.
 *
 * All configuration is read from the environment exactly once, validated, and
 * exposed through a typed object. Nothing in the codebase reads
 * `process.env` directly for configuration, and no secret is ever hardcoded.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

const envSchema = z.object({
  FREELM_DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres@localhost:5432/freelm'),
  FREELM_REDIS_URL: z.string().default('redis://localhost:6379'),

  FREELM_AUTH_SECRET: z.string().default(''),
  FREELM_GOOGLE_CLIENT_ID: z.string().default(''),
  FREELM_GOOGLE_CLIENT_SECRET: z.string().default(''),

  FREELM_AI_PROVIDER: z
    .enum(['openai', 'gemini', 'anthropic', 'openai-compatible'])
    .default('openai'),

  FREELM_EMBEDDING_PROVIDER: z
    .enum(['auto', 'local', 'openai', 'gemini', 'anthropic', 'openai-compatible'])
    .default('auto'),

  FREELM_OPENAI_API_KEY: z.string().default(''),
  FREELM_OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  FREELM_OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  FREELM_OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  FREELM_OPENAI_TTS_MODEL: z.string().default('gpt-4o-mini-tts'),

  FREELM_GEMINI_API_KEY: z.string().default(''),
  FREELM_GEMINI_CHAT_MODEL: z.string().default('gemini-2.5-flash'),
  FREELM_GEMINI_EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  FREELM_GEMINI_TTS_MODEL: z.string().default('gemini-2.5-flash-preview-tts'),

  FREELM_ANTHROPIC_API_KEY: z.string().default(''),
  FREELM_ANTHROPIC_CHAT_MODEL: z.string().default('claude-sonnet-4-5'),

  FREELM_OPENAI_COMPATIBLE_BASE_URL: z.string().default(''),
  FREELM_OPENAI_COMPATIBLE_API_KEY: z.string().default(''),
  FREELM_OPENAI_COMPATIBLE_CHAT_MODEL: z.string().default(''),
  FREELM_OPENAI_COMPATIBLE_EMBEDDING_MODEL: z.string().default(''),

  /**
   * Which text-to-speech backend to use for Audio Overviews.
   * `edge` is keyless and speaks 100+ languages.
   */
  FREELM_TTS_BACKEND: z
    .enum(['auto', 'edge', 'openai', 'gemini'])
    .default('auto'),

  FREELM_TITLE_MODEL: z.string().default(''),

  FREELM_EMBEDDING_DIM: z.coerce.number().int().positive().default(1536),
  FREELM_RETRIEVAL_K: z.coerce.number().int().min(4).max(40).default(12),

  FREELM_BRAVE_API_KEY: z.string().default(''),
  FREELM_TAVILY_API_KEY: z.string().default(''),

  FREELM_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  FREELM_STORAGE_PATH: z.string().default('./storage'),
  FREELM_S3_BUCKET: z.string().default(''),
  FREELM_S3_REGION: z.string().default('auto'),
  FREELM_S3_ENDPOINT: z.string().default(''),
  FREELM_S3_ACCESS_KEY_ID: z.string().default(''),
  FREELM_S3_SECRET_ACCESS_KEY: z.string().default(''),
  FREELM_S3_PUBLIC_URL: z.string().default(''),

  FREELM_PUBLIC_URL: z.string().default('http://localhost:3000'),

  FREELM_GOOGLE_DRIVE_CLIENT_ID: z.string().default(''),
  FREELM_GOOGLE_DRIVE_CLIENT_SECRET: z.string().default(''),

  FREELM_MAX_SOURCE_MB: z.coerce.number().int().positive().default(200),
  FREELM_MAX_SOURCE_WORDS: z.coerce.number().int().positive().default(500_000),
  FREELM_ENABLE_SANDBOX: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

function loadEnv(): z.infer<typeof envSchema> {
  // Next.js loads `.env.local` itself, but the BullMQ workers and the
  // scripts run under plain Node — so load it here too. Existing process
  // variables always win, so this never overrides a real deployment.
  if (typeof process !== 'undefined' && typeof process.loadEnvFile === 'function') {
    for (const candidate of [
      '.env.local',
      '../../.env.local',
      path.join(process.cwd(), 'apps', 'web', '.env.local'),
    ]) {
      try {
        if (existsSync(candidate)) {
          process.loadEnvFile(candidate);
          break;
        }
      } catch {
        /* try the next candidate */
      }
    }
  }

  const raw: Record<string, unknown> = {};
  const source =
    typeof process !== 'undefined' && process.env ? process.env : {};
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('FREELM_') && value !== undefined) raw[key] = value;
  }
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid FreeLM environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();

/** True when an AI provider is configured and able to answer. */
export function hasAiProvider(): boolean {
  switch (env.FREELM_AI_PROVIDER) {
    case 'openai':
      return env.FREELM_OPENAI_API_KEY.length > 0;
    case 'gemini':
      return env.FREELM_GEMINI_API_KEY.length > 0;
    case 'anthropic':
      return env.FREELM_ANTHROPIC_API_KEY.length > 0;
    case 'openai-compatible':
      return env.FREELM_OPENAI_COMPATIBLE_BASE_URL.length > 0;
    default:
      return false;
  }
}

/** True when a hosted embedding provider is reachable. */
export function hasEmbeddingProvider(): boolean {
  switch (env.FREELM_EMBEDDING_PROVIDER) {
    case 'local':
      return true;
    case 'openai':
      return env.FREELM_OPENAI_API_KEY.length > 0;
    case 'gemini':
      return env.FREELM_GEMINI_API_KEY.length > 0;
    case 'anthropic':
      return (
        env.FREELM_ANTHROPIC_API_KEY.length > 0 ||
        env.FREELM_OPENAI_API_KEY.length > 0
      );
    case 'openai-compatible':
      return env.FREELM_OPENAI_COMPATIBLE_BASE_URL.length > 0;
    case 'auto':
    default:
      return (
        env.FREELM_OPENAI_API_KEY.length > 0 ||
        env.FREELM_GEMINI_API_KEY.length > 0 ||
        env.FREELM_OPENAI_COMPATIBLE_BASE_URL.length > 0
      );
  }
}

/** True when Google OAuth sign-in is configured. */
export function hasGoogleAuth(): boolean {
  return (
    env.FREELM_GOOGLE_CLIENT_ID.length > 0 &&
    env.FREELM_GOOGLE_CLIENT_SECRET.length > 0
  );
}

/** True when Google Drive import is configured. */
export function hasGoogleDrive(): boolean {
  return (
    env.FREELM_GOOGLE_DRIVE_CLIENT_ID.length > 0 &&
    env.FREELM_GOOGLE_DRIVE_CLIENT_SECRET.length > 0
  );
}
