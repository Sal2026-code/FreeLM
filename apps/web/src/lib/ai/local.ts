/**
 * FreeLM — local embedding provider.
 *
 * A dependency-free, offline embedding model based on the hashing trick.
 * Words and character trigrams are hashed into a fixed-width vector with
 * signed buckets and sub-linear term frequency weighting, then L2
 * normalised.
 *
 * It is not as semantically rich as a trained transformer, but it is a real
 * lexical embedding: it puts documents that share vocabulary close together
 * in cosine space, which is exactly what retrieval needs. That makes FreeLM
 * fully usable with **no API key at all** — useful for offline work, for
 * trying the app before wiring up a provider, and as a fallback when the
 * configured embedding provider is unreachable.
 *
 * The model name (`local-hash-v1`) is stored on every vector, so switching to
 * a hosted model later is a clean migration (see `npm run db:reembed`).
 */

import type { AiProvider, ProviderInfo, TTSOptions } from './provider';

export const LOCAL_EMBEDDING_MODEL = 'local-hash-v1';
const LOCAL_EMBEDDING_DIM = 1536;

/** FNV-1a — fast, stable across runs and platforms. */
function hash(text: string, seed: number): number {
  let value = 0x811c9dc5 ^ seed;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has',
  'have', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to',
  'was', 'were', 'will', 'with', 'this', 'these', 'those', 'their', 'they',
  'them', 'we', 'you', 'your', 'our', 'not', 'can', 'all', 'more', 'than',
  'when', 'what', 'which', 'who', 'how', 'why', 'also', 'into', 'about',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Character trigrams give partial credit for shared word stems. */
function trigrams(token: string): string[] {
  const padded = `^${token}$`;
  const result: string[] = [];
  for (let index = 0; index + 3 <= padded.length; index += 1) {
    result.push(padded.slice(index, index + 3));
  }
  return result;
}

export class LocalEmbeddingProvider implements AiProvider {
  private readonly dimension: number;

  constructor(dimension: number = LOCAL_EMBEDDING_DIM) {
    this.dimension = dimension;
  }

  get info(): ProviderInfo {
    return {
      name: 'local',
      chatModel: 'local (no chat model)',
      embeddingModel: LOCAL_EMBEDDING_MODEL,
      embeddingDim: this.dimension,
      supportsJsonSchema: false,
      supportsStreaming: false,
      supportsTts: false,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const vector = new Array<number>(this.dimension).fill(0);

    const tokens = tokenize(text);
    const counts = new Map<string, number>();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    for (const [token, count] of counts) {
      // Sub-linear term frequency: the tenth mention of a word says much less
      // than the first.
      const weight = 1 + Math.log(count);

      // Whole-word bucket.
      const wordIndex = hash(token, 0x9e37) % this.dimension;
      const wordSign = hash(token, 0x85eb) % 2 === 0 ? 1 : -1;
      vector[wordIndex] = (vector[wordIndex] ?? 0) + wordSign * weight;

      // Character-trigram buckets, weighted lower, so "embeddings" and
      // "embedding" land near each other.
      for (const gram of trigrams(token)) {
        const gramIndex = hash(gram, 0xc2b2) % this.dimension;
        const gramSign = hash(gram, 0x27d4) % 2 === 0 ? 1 : -1;
        vector[gramIndex] = (vector[gramIndex] ?? 0) + gramSign * weight * 0.35;
      }
    }

    // L2 normalise so cosine similarity is a dot product.
    let magnitude = 0;
    for (const value of vector) magnitude += value * value;
    magnitude = Math.sqrt(magnitude);

    if (magnitude === 0) return vector;
    return vector.map((value) => value / magnitude);
  }

  async chat(): Promise<string> {
    throw new Error(
      'The local embedding provider has no chat model. Configure FREELM_AI_PROVIDER with a chat provider (openai, gemini, anthropic or openai-compatible).',
    );
  }

  async tts(_text: string, _options: TTSOptions): Promise<Buffer> {
    throw new Error(
      'The local embedding provider has no text-to-speech. Audio Overviews use the configured provider, or the free edge-tts backend.',
    );
  }
}
