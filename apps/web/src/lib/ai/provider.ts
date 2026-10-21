/**
 * FreeLM — AI provider interface.
 *
 * One interface, four implementations:
 *   • openai            — OpenAI (also used for any OpenAI-compatible endpoint)
 *   • openai-compatible — Ollama, LM Studio, vLLM, OpenRouter, Groq, …
 *   • gemini            — Google Gemini (native API shape)
 *   • anthropic         — Anthropic Claude (Messages API)
 *
 * All of them are implemented over plain `fetch` — no vendor SDK — so the
 * app has no dependency that can break when a provider changes its client
 * library.
 */

import { UpstreamError } from './errors';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** JSON Schema for structured outputs. When present the provider is asked
   *  for strict JSON matching the schema. */
  jsonSchema?: Record<string, unknown>;
  /** Called with incremental text when the provider supports streaming. */
  onToken?: (token: string) => void;
  signal?: AbortSignal;
  /** Ask the provider to produce JSON (without a schema). */
  jsonMode?: boolean;
}

export interface TTSOptions {
  voice: string;
  /** Preferred output container. */
  format?: 'mp3' | 'wav' | 'pcm';
  speed?: number;
  /** BCP-47 language tag, used by providers that need it. */
  language?: string;
  instructions?: string;
}

export interface ProviderInfo {
  name: string;
  chatModel: string;
  embeddingModel: string;
  embeddingDim: number;
  supportsJsonSchema: boolean;
  supportsStreaming: boolean;
  supportsTts: boolean;
}

export interface AiProvider {
  readonly info: ProviderInfo;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  embed(texts: string[]): Promise<number[][]>;
  tts(text: string, options: TTSOptions): Promise<Buffer>;
}

/**
 * Extract a JSON value from a model response.
 *
 * Models sometimes wrap JSON in markdown fences or add a sentence of
 * commentary around it. This pulls the JSON out of all of that.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();

  // 1. Fenced code block.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() ?? trimmed;

  // 2. Whole-string JSON.
  try {
    return JSON.parse(candidate);
  } catch {
    /* keep going */
  }

  // 3. First balanced object or array in the text.
  const start = candidate.search(/[{[]/);
  if (start !== -1) {
    const opening = candidate[start] as '{' | '[';
    const closing = opening === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i += 1) {
      const char = candidate[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === opening) depth += 1;
      if (char === closing) {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new UpstreamError({
    code: 'BAD_RESPONSE',
    message: 'Could not parse JSON from the provider response.',
    provider: 'unknown',
  });
}

/**
 * Ask a provider for JSON and validate it.
 *
 * Falls back to a repair pass when the first attempt is not valid JSON, so
 * weaker local models still produce usable output.
 */
export async function generateStructured<T>(
  provider: AiProvider,
  messages: ChatMessage[],
  options: {
    jsonSchema?: Record<string, unknown>;
    validate: (value: unknown) => T;
    signal?: AbortSignal;
    temperature?: number;
  },
): Promise<T> {
  const attempts: ChatMessage[][] = [
    messages,
    [
      ...messages,
      {
        role: 'user',
        content:
          'Your previous reply was not valid JSON. Reply with the JSON object only — no prose, no markdown fences, no explanation.',
      },
    ],
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts.length; attempt += 1) {
    const raw = await provider.chat(attempts[attempt] as ChatMessage[], {
      ...(options.jsonSchema ? { jsonSchema: options.jsonSchema } : { jsonMode: true }),
      ...(options.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    try {
      const parsed = extractJson(raw);
      return options.validate(parsed);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof UpstreamError
    ? lastError
    : new UpstreamError({
        code: 'BAD_RESPONSE',
        message: 'The model did not return valid JSON.',
        provider: provider.info.name,
        cause: lastError,
      });
}
