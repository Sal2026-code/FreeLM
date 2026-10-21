/**
 * FreeLM — OpenAI provider (also powers every OpenAI-compatible endpoint).
 *
 * Implemented over plain `fetch` against the Chat Completions, Embeddings
 * and Speech APIs. Because the wire format is standard, pointing
 * `FREELM_OPENAI_BASE_URL` at Ollama, LM Studio, vLLM, OpenRouter, Groq,
 * Together, DeepSeek, Mistral, xAI or Cloudflare Workers AI just works.
 */

import { networkError, toUpstreamError } from './errors';
import type {
  AiProvider,
  ChatMessage,
  ChatOptions,
  ProviderInfo,
  TTSOptions,
} from './provider';

interface OpenAiChatResponse {
  choices?: {
    message?: { content?: string | null };
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  error?: { message?: string; code?: string; type?: string };
}

interface OpenAiEmbeddingResponse {
  data?: { embedding?: number[]; index?: number }[];
  error?: { message?: string; code?: string; type?: string };
}

/** Known embedding dimensions, so the pgvector column always matches. */
function embeddingDimForModel(model: string): number {
  const name = model.toLowerCase();
  if (name.includes('text-embedding-3-large')) return 3072;
  if (name.includes('text-embedding-3-small')) return 1536;
  if (name.includes('ada-002')) return 1536;
  if (name.includes('text-embedding-004')) return 768;
  if (name.includes('nomic-embed-text')) return 768;
  if (name.includes('mxbai-embed-large')) return 1024;
  if (name.includes('bge-m3')) return 1024;
  if (name.includes('all-minilm')) return 384;
  // Unknown model: assume 1536 (the FreeLM default) and let the vector
  // length of the first response correct the record.
  return 1536;
}

export interface OpenAiProviderConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  ttsModel: string;
  name: string;
}

export class OpenAiProvider implements AiProvider {
  private readonly config: OpenAiProviderConfig;

  constructor(config: OpenAiProviderConfig) {
    this.config = config;
  }

  get info(): ProviderInfo {
    return {
      name: this.config.name,
      chatModel: this.config.chatModel,
      embeddingModel: this.config.embeddingModel,
      embeddingDim: embeddingDimForModel(this.config.embeddingModel),
      supportsJsonSchema: true,
      supportsStreaming: true,
      supportsTts: true,
    };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;
    return headers;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const model = options.model ?? this.config.chatModel;
    const payload: Record<string, unknown> = {
      model,
      messages,
      stream: Boolean(options.onToken),
    };
    if (options.temperature !== undefined) payload.temperature = options.temperature;
    if (options.maxTokens !== undefined) payload.max_tokens = options.maxTokens;
    if (options.jsonSchema) {
      payload.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'freelm_output',
          strict: false,
          schema: options.jsonSchema,
        },
      };
    } else if (options.jsonMode) {
      payload.response_format = { type: 'json_object' };
    }

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      throw networkError(this.config.name, error);
    }

    if (!response.ok) {
      throw await toUpstreamError(response, this.config.name);
    }

    if (options.onToken) {
      return this.consumeStream(response, options.onToken);
    }

    const data = (await response.json()) as OpenAiChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw await toUpstreamError(
        new Response(JSON.stringify(data), { status: 200 }),
        this.config.name,
        'Provider returned an empty message.',
      );
    }
    return content;
  }

  /** Read an SSE stream and forward text deltas to `onToken`. */
  private async consumeStream(
    response: Response,
    onToken: (token: string) => void,
  ): Promise<string> {
    const body = response.body;
    if (!body) return '';
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            newlineIndex = buffer.indexOf('\n');
            continue;
          }
          try {
            const parsed = JSON.parse(data) as OpenAiChatResponse;
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              full += delta;
              onToken(delta);
            }
          } catch {
            /* ignore keep-alive frames */
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }

    return full;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ model: this.config.embeddingModel, input: texts }),
      });
    } catch (error) {
      throw networkError(this.config.name, error);
    }

    if (!response.ok) throw await toUpstreamError(response, this.config.name);

    const data = (await response.json()) as OpenAiEmbeddingResponse;
    const vectors = (data.data ?? [])
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => item.embedding)
      .filter((vector): vector is number[] => Array.isArray(vector));

    if (vectors.length !== texts.length) {
      throw new Error(
        `Embedding provider returned ${vectors.length} vectors for ${texts.length} inputs.`,
      );
    }
    return vectors;
  }

  async tts(text: string, options: TTSOptions): Promise<Buffer> {
    const format = options.format ?? 'mp3';
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.config.ttsModel,
          voice: options.voice,
          input: text,
          response_format: format,
          ...(options.speed !== undefined ? { speed: options.speed } : {}),
          ...(options.instructions ? { instructions: options.instructions } : {}),
        }),
      });
    } catch (error) {
      throw networkError(this.config.name, error);
    }

    if (!response.ok) throw await toUpstreamError(response, this.config.name);
    return Buffer.from(await response.arrayBuffer());
  }
}
