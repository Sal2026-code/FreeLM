/**
 * FreeLM — provider factory.
 *
 * `getProvider()` returns the configured provider. `getEmbeddingProvider()`
 * returns the provider used for embeddings, which may differ from the chat
 * provider (Claude has no embeddings, for example).
 */

import { env, hasAiProvider } from '@/lib/env';
import { AnthropicProvider } from './anthropic';
import { UpstreamError } from './errors';
import { GeminiProvider } from './gemini';
import { LocalEmbeddingProvider } from './local';
import { OpenAiProvider } from './openai';
import type { AiProvider } from './provider';

let cachedChat: AiProvider | null = null;
let cachedEmbedding: AiProvider | null = null;

export function getChatProvider(): AiProvider {
  if (cachedChat) return cachedChat;

  switch (env.FREELM_AI_PROVIDER) {
    case 'gemini':
      cachedChat = new GeminiProvider({
        apiKey: env.FREELM_GEMINI_API_KEY,
        chatModel: env.FREELM_GEMINI_CHAT_MODEL,
        embeddingModel: env.FREELM_GEMINI_EMBEDDING_MODEL,
        ttsModel: env.FREELM_GEMINI_TTS_MODEL,
      });
      break;
    case 'anthropic':
      cachedChat = new AnthropicProvider({
        apiKey: env.FREELM_ANTHROPIC_API_KEY,
        chatModel: env.FREELM_ANTHROPIC_CHAT_MODEL,
        embeddingFallback: buildCompatibleFallback() ?? undefined,
      });
      break;
    case 'openai-compatible':
      cachedChat = new OpenAiProvider({
        apiKey: env.FREELM_OPENAI_COMPATIBLE_API_KEY,
        baseUrl: env.FREELM_OPENAI_COMPATIBLE_BASE_URL,
        chatModel:
          env.FREELM_OPENAI_COMPATIBLE_CHAT_MODEL || 'local-model',
        embeddingModel:
          env.FREELM_OPENAI_COMPATIBLE_EMBEDDING_MODEL || 'text-embedding-3-small',
        ttsModel: env.FREELM_OPENAI_TTS_MODEL,
        name: 'openai-compatible',
      });
      break;
    case 'openai':
    default:
      cachedChat = new OpenAiProvider({
        apiKey: env.FREELM_OPENAI_API_KEY,
        baseUrl: env.FREELM_OPENAI_BASE_URL,
        chatModel: env.FREELM_OPENAI_CHAT_MODEL,
        embeddingModel: env.FREELM_OPENAI_EMBEDDING_MODEL,
        ttsModel: env.FREELM_OPENAI_TTS_MODEL,
        name: 'openai',
      });
      break;
  }
  return cachedChat;
}

function buildCompatibleFallback():
  | { baseUrl: string; apiKey: string; model: string }
  | null {
  if (env.FREELM_OPENAI_COMPATIBLE_BASE_URL) {
    return {
      baseUrl: env.FREELM_OPENAI_COMPATIBLE_BASE_URL,
      apiKey: env.FREELM_OPENAI_COMPATIBLE_API_KEY,
      model: env.FREELM_OPENAI_COMPATIBLE_EMBEDDING_MODEL || 'text-embedding-3-small',
    };
  }
  if (env.FREELM_OPENAI_API_KEY) {
    return {
      baseUrl: env.FREELM_OPENAI_BASE_URL,
      apiKey: env.FREELM_OPENAI_API_KEY,
      model: env.FREELM_OPENAI_EMBEDDING_MODEL,
    };
  }
  return null;
}

export function getEmbeddingProvider(): AiProvider {
  if (cachedEmbedding) return cachedEmbedding;

  // The embedding provider can differ from the chat provider (Claude has no
  // embeddings) and can be pinned to the offline local model.
  const choice = env.FREELM_EMBEDDING_PROVIDER;

  if (choice === 'local') {
    cachedEmbedding = new LocalEmbeddingProvider(env.FREELM_EMBEDDING_DIM);
    return cachedEmbedding;
  }

  if (choice === 'anthropic') {
    const fallback = buildCompatibleFallback();
    if (!fallback) {
      throw new UpstreamError({
        code: 'NO_PROVIDER',
        message:
          'Anthropic has no embedding model. Configure an OpenAI-compatible embedding endpoint.',
        provider: 'anthropic',
        retryable: false,
      });
    }
    cachedEmbedding = new OpenAiProvider({
      apiKey: fallback.apiKey,
      baseUrl: fallback.baseUrl,
      chatModel: env.FREELM_ANTHROPIC_CHAT_MODEL,
      embeddingModel: fallback.model,
      ttsModel: env.FREELM_OPENAI_TTS_MODEL,
      name: 'openai-compatible',
    });
    return cachedEmbedding;
  }

  if (choice === 'gemini') {
    cachedEmbedding = new GeminiProvider({
      apiKey: env.FREELM_GEMINI_API_KEY,
      chatModel: env.FREELM_GEMINI_CHAT_MODEL,
      embeddingModel: env.FREELM_GEMINI_EMBEDDING_MODEL,
      ttsModel: env.FREELM_GEMINI_TTS_MODEL,
    });
    return cachedEmbedding;
  }

  if (choice === 'openai-compatible') {
    cachedEmbedding = new OpenAiProvider({
      apiKey: env.FREELM_OPENAI_COMPATIBLE_API_KEY,
      baseUrl: env.FREELM_OPENAI_COMPATIBLE_BASE_URL,
      chatModel: env.FREELM_OPENAI_COMPATIBLE_CHAT_MODEL || 'local-model',
      embeddingModel:
        env.FREELM_OPENAI_COMPATIBLE_EMBEDDING_MODEL || 'text-embedding-3-small',
      ttsModel: env.FREELM_OPENAI_TTS_MODEL,
      name: 'openai-compatible',
    });
    return cachedEmbedding;
  }

  if (choice === 'openai') {
    cachedEmbedding = new OpenAiProvider({
      apiKey: env.FREELM_OPENAI_API_KEY,
      baseUrl: env.FREELM_OPENAI_BASE_URL,
      chatModel: env.FREELM_OPENAI_CHAT_MODEL,
      embeddingModel: env.FREELM_OPENAI_EMBEDDING_MODEL,
      ttsModel: env.FREELM_OPENAI_TTS_MODEL,
      name: 'openai',
    });
    return cachedEmbedding;
  }

  // auto — use a hosted provider when one is configured, otherwise fall back
  // to the offline local embedding model so the app still works keyless.
  if (env.FREELM_OPENAI_API_KEY) {
    cachedEmbedding = new OpenAiProvider({
      apiKey: env.FREELM_OPENAI_API_KEY,
      baseUrl: env.FREELM_OPENAI_BASE_URL,
      chatModel: env.FREELM_OPENAI_CHAT_MODEL,
      embeddingModel: env.FREELM_OPENAI_EMBEDDING_MODEL,
      ttsModel: env.FREELM_OPENAI_TTS_MODEL,
      name: 'openai',
    });
    return cachedEmbedding;
  }

  if (env.FREELM_GEMINI_API_KEY) {
    cachedEmbedding = new GeminiProvider({
      apiKey: env.FREELM_GEMINI_API_KEY,
      chatModel: env.FREELM_GEMINI_CHAT_MODEL,
      embeddingModel: env.FREELM_GEMINI_EMBEDDING_MODEL,
      ttsModel: env.FREELM_GEMINI_TTS_MODEL,
    });
    return cachedEmbedding;
  }

  if (env.FREELM_OPENAI_COMPATIBLE_BASE_URL) {
    cachedEmbedding = new OpenAiProvider({
      apiKey: env.FREELM_OPENAI_COMPATIBLE_API_KEY,
      baseUrl: env.FREELM_OPENAI_COMPATIBLE_BASE_URL,
      chatModel: env.FREELM_OPENAI_COMPATIBLE_CHAT_MODEL || 'local-model',
      embeddingModel:
        env.FREELM_OPENAI_COMPATIBLE_EMBEDDING_MODEL || 'text-embedding-3-small',
      ttsModel: env.FREELM_OPENAI_TTS_MODEL,
      name: 'openai-compatible',
    });
    return cachedEmbedding;
  }

  cachedEmbedding = new LocalEmbeddingProvider(env.FREELM_EMBEDDING_DIM);
  return cachedEmbedding;
}

/** The model used to auto-title chat threads (falls back to the chat model). */
export function getTitleModel(): string {
  return env.FREELM_TITLE_MODEL || getChatProvider().info.chatModel;
}

/** Throw a friendly error when no provider is configured. */
export function requireProvider(): AiProvider {
  if (!hasAiProvider()) {
    throw new UpstreamError({
      code: 'NO_PROVIDER',
      message: 'No AI provider is configured.',
      provider: 'none',
      retryable: false,
    });
  }
  return getChatProvider();
}

/** Reset the cached providers (used by tests and the settings page). */
export function resetProviderCache(): void {
  cachedChat = null;
  cachedEmbedding = null;
}
