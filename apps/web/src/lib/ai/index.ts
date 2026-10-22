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
import { FallbackProvider } from './fallback';
import { GeminiProvider } from './gemini';
import { LocalEmbeddingProvider } from './local';
import { OpenAiProvider } from './openai';
import type {
  AiProvider,
  ChatMessage,
  ChatOptions,
  ProviderInfo,
  TTSOptions,
} from './provider';

let cachedChat: AiProvider | null = null;
let cachedEmbedding: AiProvider | null = null;

export function getChatProvider(): AiProvider {
  if (cachedChat) return cachedChat;

  const choice = env.FREELM_AI_PROVIDER;

  // `auto` picks the first provider that is actually configured. It prefers
  // Gemini, because it is the only hosted provider here that offers
  // multi-voice text-to-speech across 100+ languages.
  if (choice === 'auto') {
    const candidates = autoCandidates();
    if (candidates.length > 0) {
      // The wrapper moves to the next provider whenever a call fails, so a key
      // whose API is not enabled does not break the app.
      cachedChat =
        candidates.length === 1
          ? candidates[0]!
          : new FallbackProvider(candidates);
      return cachedChat;
    }
    throw new UpstreamError({
      code: 'NO_PROVIDER',
      message:
        'No AI provider is configured. Add a key to .env.local (OpenAI, Gemini, Anthropic, or any OpenAI-compatible endpoint).',
      provider: 'none',
      retryable: false,
    });
  }

  switch (choice) {
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

/** Every provider that is configured, in the order `auto` should try them. */
function autoCandidates(): AiProvider[] {
  const providers: AiProvider[] = [];

  if (env.FREELM_OPENAI_API_KEY) {
    providers.push(
      new OpenAiProvider({
        apiKey: env.FREELM_OPENAI_API_KEY,
        baseUrl: env.FREELM_OPENAI_BASE_URL,
        chatModel: env.FREELM_OPENAI_CHAT_MODEL,
        embeddingModel: env.FREELM_OPENAI_EMBEDDING_MODEL,
        ttsModel: env.FREELM_OPENAI_TTS_MODEL,
        name: 'openai',
      }),
    );
  }

  if (env.FREELM_GEMINI_API_KEY) {
    providers.push(
      new GeminiProvider({
        apiKey: env.FREELM_GEMINI_API_KEY,
        chatModel: env.FREELM_GEMINI_CHAT_MODEL,
        embeddingModel: env.FREELM_GEMINI_EMBEDDING_MODEL,
        ttsModel: env.FREELM_GEMINI_TTS_MODEL,
      }),
    );
  }

  if (env.FREELM_ANTHROPIC_API_KEY) {
    providers.push(
      new AnthropicProvider({
        apiKey: env.FREELM_ANTHROPIC_API_KEY,
        chatModel: env.FREELM_ANTHROPIC_CHAT_MODEL,
        embeddingFallback: buildCompatibleFallback() ?? undefined,
      }),
    );
  }

  if (env.FREELM_OPENAI_COMPATIBLE_BASE_URL) {
    providers.push(
      new OpenAiProvider({
        apiKey: env.FREELM_OPENAI_COMPATIBLE_API_KEY,
        baseUrl: env.FREELM_OPENAI_COMPATIBLE_BASE_URL,
        chatModel: env.FREELM_OPENAI_COMPATIBLE_CHAT_MODEL || 'local-model',
        embeddingModel:
          env.FREELM_OPENAI_COMPATIBLE_EMBEDDING_MODEL || 'text-embedding-3-small',
        ttsModel: env.FREELM_OPENAI_TTS_MODEL,
        name: 'openai-compatible',
      }),
    );
  }

  return providers;
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

/**
 * An embedding provider that falls back when the primary one fails.
 *
 * A misconfigured or not-yet-enabled hosted provider must never take the
 * app down: if the primary throws (a 403 because an API is disabled, a 401
 * because a key expired, a 429 because of rate limits) the built-in offline
 * model takes over so retrieval keeps working.
 */
class ResilientEmbeddingProvider implements AiProvider {
  constructor(
    private readonly primary: AiProvider,
    private readonly fallback: AiProvider,
  ) {}

  get info(): ProviderInfo {
    return this.primary.info;
  }

  async embed(texts: string[]): Promise<number[][]> {
    // A vector of the wrong width can never be stored, so a mismatch is not a
    // transient failure — use the fallback straight away rather than
    // discovering it at insert time. The fallback always matches the column
    // width, because it is built from FREELM_EMBEDDING_DIM.
    if (this.primary.info.embeddingDim !== env.FREELM_EMBEDDING_DIM) {
      return this.fallback.embed(texts);
    }

    try {
      return await this.primary.embed(texts);
    } catch (error) {
      console.warn(
        `[ai] embedding provider "${this.primary.info.name}" failed, using the local model instead:`,
        error instanceof Error ? error.message : error,
      );
      return this.fallback.embed(texts);
    }
  }

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    return this.primary.chat(messages, options);
  }

  tts(text: string, options: TTSOptions): Promise<Buffer> {
    return this.primary.tts(text, options);
  }
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
  if (env.FREELM_AI_PROVIDER === 'auto' || choice === 'auto') {
    const local = new LocalEmbeddingProvider(env.FREELM_EMBEDDING_DIM);

    if (env.FREELM_GEMINI_API_KEY) {
      cachedEmbedding = new ResilientEmbeddingProvider(
        new GeminiProvider({
          apiKey: env.FREELM_GEMINI_API_KEY,
          chatModel: env.FREELM_GEMINI_CHAT_MODEL,
          embeddingModel: env.FREELM_GEMINI_EMBEDDING_MODEL,
          ttsModel: env.FREELM_GEMINI_TTS_MODEL,
        }),
        local,
      );
      return cachedEmbedding;
    }

    if (env.FREELM_OPENAI_API_KEY) {
      cachedEmbedding = new ResilientEmbeddingProvider(
        new OpenAiProvider({
          apiKey: env.FREELM_OPENAI_API_KEY,
          baseUrl: env.FREELM_OPENAI_BASE_URL,
          chatModel: env.FREELM_OPENAI_CHAT_MODEL,
          embeddingModel: env.FREELM_OPENAI_EMBEDDING_MODEL,
          ttsModel: env.FREELM_OPENAI_TTS_MODEL,
          name: 'openai',
        }),
        local,
      );
      return cachedEmbedding;
    }

    if (env.FREELM_OPENAI_COMPATIBLE_BASE_URL) {
      cachedEmbedding = new ResilientEmbeddingProvider(
        new OpenAiProvider({
          apiKey: env.FREELM_OPENAI_COMPATIBLE_API_KEY,
          baseUrl: env.FREELM_OPENAI_COMPATIBLE_BASE_URL,
          chatModel: env.FREELM_OPENAI_COMPATIBLE_CHAT_MODEL || 'local-model',
          embeddingModel:
            env.FREELM_OPENAI_COMPATIBLE_EMBEDDING_MODEL ||
            'text-embedding-3-small',
          ttsModel: env.FREELM_OPENAI_TTS_MODEL,
          name: 'openai-compatible',
        }),
        local,
      );
      return cachedEmbedding;
    }

    cachedEmbedding = local;
    return cachedEmbedding;
  }

  // Nothing matched — fall back to the offline model rather than failing.
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
