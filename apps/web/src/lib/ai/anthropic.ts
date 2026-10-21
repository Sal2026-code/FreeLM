/**
 * FreeLM — Anthropic Claude provider.
 *
 * Uses the Messages API. Claude has no embeddings endpoint, so embedding
 * requests fall back to the configured OpenAI-compatible endpoint when one
 * is available, and otherwise report a clear configuration error.
 */

import { networkError, toUpstreamError, UpstreamError } from './errors';
import type {
  AiProvider,
  ChatMessage,
  ChatOptions,
  ProviderInfo,
  TTSOptions,
} from './provider';

const ANTHROPIC_API_ROOT = 'https://api.anthropic.com/v1';

interface AnthropicResponse {
  content?: { type?: string; text?: string }[];
  error?: { message?: string; type?: string };
}

export interface AnthropicProviderConfig {
  apiKey: string;
  chatModel: string;
  /** Optional embedding fallback (any OpenAI-compatible endpoint). */
  embeddingFallback?: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
}

export class AnthropicProvider implements AiProvider {
  private readonly config: AnthropicProviderConfig;

  constructor(config: AnthropicProviderConfig) {
    this.config = config;
  }

  get info(): ProviderInfo {
    return {
      name: 'anthropic',
      chatModel: this.config.chatModel,
      embeddingModel: this.config.embeddingFallback?.model ?? 'not-configured',
      embeddingDim: this.config.embeddingFallback ? 1536 : 0,
      supportsJsonSchema: false,
      supportsStreaming: false,
      supportsTts: false,
    };
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const model = options.model ?? this.config.chatModel;
    const systemText = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const messages_ = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: options.maxTokens ?? 4096,
      messages: messages_,
    };
    if (systemText) body.system = systemText;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.jsonSchema || options.jsonMode) {
      // Claude has no JSON mode; instruct it explicitly and parse afterwards.
      body.system = `${systemText}\n\nYou must reply with a single valid JSON value and nothing else — no prose, no markdown fences.`.trim();
    }

    let response: Response;
    try {
      response = await fetch(`${ANTHROPIC_API_ROOT}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      throw networkError('anthropic', error);
    }

    if (!response.ok) throw await toUpstreamError(response, 'anthropic');

    const data = (await response.json()) as AnthropicResponse;
    const text = (data.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');
    if (!text) {
      throw await toUpstreamError(
        new Response(JSON.stringify(data), { status: 200 }),
        'anthropic',
        'Anthropic returned an empty message.',
      );
    }
    if (options.onToken) options.onToken(text);
    return text;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const fallback = this.config.embeddingFallback;
    if (!fallback) {
      throw new UpstreamError({
        code: 'NO_PROVIDER',
        message:
          'Anthropic does not provide embeddings. Configure an OpenAI-compatible embedding endpoint to use Claude as the chat model.',
        provider: 'anthropic',
      });
    }
    let response: Response;
    try {
      response = await fetch(`${fallback.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fallback.apiKey
            ? { Authorization: `Bearer ${fallback.apiKey}` }
            : {}),
        },
        body: JSON.stringify({ model: fallback.model, input: texts }),
      });
    } catch (error) {
      throw networkError('anthropic', error);
    }
    if (!response.ok) throw await toUpstreamError(response, 'anthropic');
    const data = (await response.json()) as {
      data?: { embedding?: number[]; index?: number }[];
    };
    return (data.data ?? [])
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => item.embedding)
      .filter((vector): vector is number[] => Array.isArray(vector));
  }

  async tts(): Promise<Buffer> {
    throw new UpstreamError({
      code: 'NO_PROVIDER',
      message:
        'Anthropic does not provide text-to-speech. Configure OpenAI, Gemini or edge-tts for audio overviews.',
      provider: 'anthropic',
      retryable: false,
    });
  }
}
