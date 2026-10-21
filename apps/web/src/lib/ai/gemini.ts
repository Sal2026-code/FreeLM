/**
 * FreeLM — Google Gemini provider.
 *
 * Implements the native Gemini API shape (`generateContent`,
 * `embedContent`, `generateContent` with TTS response modality) so Gemini
 * can be used as a first-class alternative to OpenAI.
 */

import { networkError, toUpstreamError } from './errors';
import type {
  AiProvider,
  ChatMessage,
  ChatOptions,
  ProviderInfo,
  TTSOptions,
} from './provider';

const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  error?: { message?: string; status?: string; code?: number };
}

export interface GeminiProviderConfig {
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  ttsModel: string;
}

export class GeminiProvider implements AiProvider {
  private readonly config: GeminiProviderConfig;

  constructor(config: GeminiProviderConfig) {
    this.config = config;
  }

  get info(): ProviderInfo {
    return {
      name: 'gemini',
      chatModel: this.config.chatModel,
      embeddingModel: this.config.embeddingModel,
      embeddingDim: this.config.embeddingModel.includes('004') ? 768 : 768,
      supportsJsonSchema: true,
      supportsStreaming: false,
      supportsTts: true,
    };
  }

  private url(path: string): string {
    return `${GEMINI_API_ROOT}/${path}?key=${encodeURIComponent(this.config.apiKey)}`;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const model = options.model ?? this.config.chatModel;

    // Gemini uses `contents` + a separate `systemInstruction`.
    const systemText = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = { contents };
    if (systemText) {
      body.systemInstruction = { parts: [{ text: systemText }] };
    }
    const generationConfig: Record<string, unknown> = {};
    if (options.temperature !== undefined) {
      generationConfig.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = options.maxTokens;
    }
    if (options.jsonSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = options.jsonSchema;
    } else if (options.jsonMode) {
      generationConfig.responseMimeType = 'application/json';
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    let response: Response;
    try {
      response = await fetch(this.url(`models/${model}:generateContent`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      throw networkError('gemini', error);
    }

    if (!response.ok) throw await toUpstreamError(response, 'gemini');

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('');
    if (typeof text !== 'string') {
      throw await toUpstreamError(
        new Response(JSON.stringify(data), { status: 200 }),
        'gemini',
        'Gemini returned an empty message.',
      );
    }

    if (options.onToken) {
      // Gemini is used without incremental streaming; emit the whole answer so
      // the UI still renders progressively via its own typing animation.
      options.onToken(text);
    }
    return text;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const results: number[][] = [];
    // Gemini's batchEmbedContents has a hard per-request limit; keep it small.
    const batchSize = 100;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      let response: Response;
      try {
        response = await fetch(
          this.url(`models/${this.config.embeddingModel}:batchEmbedContents`),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: batch.map((text) => ({
                model: `models/${this.config.embeddingModel}`,
                content: { parts: [{ text }] },
              })),
            }),
          },
        );
      } catch (error) {
        throw networkError('gemini', error);
      }
      if (!response.ok) throw await toUpstreamError(response, 'gemini');
      const data = (await response.json()) as {
        embeddings?: { values?: number[] }[];
      };
      for (const embedding of data.embeddings ?? []) {
        if (Array.isArray(embedding.values)) results.push(embedding.values);
      }
    }
    return results;
  }

  async tts(text: string, options: TTSOptions): Promise<Buffer> {
    const model = this.config.ttsModel;
    const voice = options.voice ?? 'Kore';

    let response: Response;
    try {
      response = await fetch(this.url(`models/${model}:generateContent`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
            },
          },
        }),
      });
    } catch (error) {
      throw networkError('gemini', error);
    }

    if (!response.ok) throw await toUpstreamError(response, 'gemini');

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
    };
    const inline = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!inline) {
      throw new Error('Gemini did not return audio data.');
    }
    // Gemini returns raw PCM (16-bit, 24 kHz) — wrap it in a WAV header so
    // ffmpeg and every browser can play it.
    return pcmToWav(Buffer.from(inline, 'base64'), 24_000, 1, 16);
  }
}

/** Wrap raw 16-bit PCM in a RIFF/WAVE container. */
export function pcmToWav(
  pcm: Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}
