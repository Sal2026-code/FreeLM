/**
 * FreeLM — text to speech.
 *
 * Three backends, chosen automatically:
 *   1. OpenAI  — highest quality, two distinct voices for the podcast hosts
 *   2. Gemini  — multi-voice, excellent multilingual coverage
 *   3. edge    — keyless Google Translate voices, used when no API key is set
 *
 * The keyless backend accepts a *language or region tag* (not a full voice
 * name) and rejects text longer than 200 characters. Different regional tags
 * select different voices, which is how the two podcast hosts end up with
 * distinct-sounding voices without an API key.
 */

import { env } from '@/lib/env';
import { getChatProvider } from '@/lib/ai';
import { UpstreamError } from '@/lib/ai/errors';
import { getLanguage, type Language } from '@freelm/shared';

export type TTSBackend = 'openai' | 'gemini' | 'edge';

export interface SpeakOptions {
  /** Voice identifier for the active backend. */
  voice?: string;
  /** BCP-47 language tag, used by providers that need it. */
  language?: string;
  speed?: number;
  instructions?: string;
}

export interface VoiceSet {
  backend: TTSBackend;
  /** Primary host voice. */
  hostA: string;
  /** Secondary host voice. */
  hostB: string;
  /** Voice used for narration (video overviews). */
  narrator: string;
  /** Slight delivery change so the two hosts never sound identical. */
  hostBSpeed?: number;
}

/** The keyless endpoint rejects anything longer than this. */
export const MAX_SEGMENT_CHARS = 190;

/**
 * Decide which TTS backend to use and which voices to use with it.
 */
export function resolveVoices(languageCode = 'en'): VoiceSet {
  const language: Language = getLanguage(languageCode);
  const backend = env.FREELM_TTS_BACKEND;

  if (backend === 'edge') {
    return edgeVoices(language);
  }

  if (
    backend === 'gemini' ||
    (backend === 'auto' &&
      env.FREELM_AI_PROVIDER === 'gemini' &&
      env.FREELM_GEMINI_API_KEY)
  ) {
    return {
      backend: 'gemini',
      hostA: language.gemini ?? 'Kore',
      hostB: language.gemini === 'Kore' ? 'Charon' : 'Kore',
      narrator: language.gemini ?? 'Kore',
    };
  }

  if (backend === 'openai' || (backend === 'auto' && env.FREELM_OPENAI_API_KEY)) {
    return {
      backend: 'openai',
      hostA: 'shimmer',
      hostB: 'onyx',
      narrator: 'shimmer',
    };
  }

  return edgeVoices(language);
}

/**
 * Two keyless voices for a language.
 *
 * The primary voice uses the language's own regional tag; the secondary uses
 * an alternate regional tag, which the service maps to a different voice.
 * When a language has no alternate tag, the delivery speed is varied
 * instead so the two hosts are still distinguishable.
 */
function edgeVoices(language: Language): VoiceSet {
  const primary = language.bcp47;
  const alternate = language.alt;

  if (alternate && alternate !== primary) {
    return {
      backend: 'edge',
      hostA: primary,
      hostB: alternate,
      narrator: primary,
    };
  }

  return {
    backend: 'edge',
    hostA: primary,
    hostB: primary,
    narrator: primary,
    hostBSpeed: 0.92,
  };
}

/**
 * Synthesise speech.
 *
 * Returns MP3 bytes.
 */
export async function speak(
  text: string,
  options: SpeakOptions = {},
): Promise<Buffer> {
  const trimmed = text.trim();
  if (!trimmed) return Buffer.alloc(0);

  const language = getLanguage(options.language ?? 'en');
  const voices = resolveVoices(options.language ?? 'en');
  const voice = options.voice ?? voices.narrator;

  switch (voices.backend) {
    case 'openai':
      return speakOpenAi(trimmed, voice, options);
    case 'gemini':
      return speakGemini(trimmed, voice);
    case 'edge':
    default:
      return speakEdge(trimmed, voice, language, options);
  }
}

async function speakOpenAi(
  text: string,
  voice: string,
  options: SpeakOptions,
): Promise<Buffer> {
  const provider = getChatProvider();
  return provider.tts(text, {
    voice,
    format: 'mp3',
    ...(options.speed !== undefined ? { speed: options.speed } : {}),
    ...(options.instructions ? { instructions: options.instructions } : {}),
  });
}

async function speakGemini(text: string, voice: string): Promise<Buffer> {
  const { GeminiProvider } = await import('@/lib/ai/gemini');
  const provider = new GeminiProvider({
    apiKey: env.FREELM_GEMINI_API_KEY,
    chatModel: env.FREELM_GEMINI_CHAT_MODEL,
    embeddingModel: env.FREELM_GEMINI_EMBEDDING_MODEL,
    ttsModel: env.FREELM_GEMINI_TTS_MODEL,
  });
  return provider.tts(text, { voice });
}

/**
 * Keyless Google Translate text-to-speech.
 *
 * `tl` is a language or region tag; the service picks a voice for it.
 */
async function speakEdge(
  text: string,
  voice: string,
  language: Language,
  options: SpeakOptions,
): Promise<Buffer> {
  const url = new URL('https://translate.google.com/translate_tts');
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('client', 'tw-ob');
  url.searchParams.set('tl', voice || language.bcp47);
  url.searchParams.set('q', text.slice(0, MAX_SEGMENT_CHARS));

  if (options.speed !== undefined) {
    url.searchParams.set('ttsspeed', String(options.speed));
  }

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://translate.google.com/',
    },
  });

  if (!response.ok) {
    throw new UpstreamError({
      code: 'UNKNOWN',
      message: `Text-to-speech failed (status ${response.status}).`,
      status: response.status,
      provider: 'edge',
    });
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength < 512) {
    throw new UpstreamError({
      code: 'BAD_RESPONSE',
      message: 'Text-to-speech returned no audio.',
      provider: 'edge',
    });
  }
  return buffer;
}

/**
 * Split a long script into speakable segments.
 *
 * The keyless backend caps a request at 200 characters, so segments are kept
 * well under that and split on sentence boundaries.
 */
export function segmentForSpeech(
  text: string,
  maxChars: number = MAX_SEGMENT_CHARS,
): string[] {
  if (text.length <= maxChars) return [text];

  const sentences = text.split(/(?<=[.!?])\s+/);
  const segments: string[] = [];
  let current = '';

  const push = () => {
    if (current.trim()) segments.push(current.trim());
    current = '';
  };

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      // A single very long sentence: split on commas and spaces.
      push();
      const words = sentence.split(' ');
      let piece = '';
      for (const word of words) {
        if (piece.length + word.length + 1 > maxChars) {
          if (piece) segments.push(piece.trim());
          piece = word;
        } else {
          piece = piece ? `${piece} ${word}` : word;
        }
      }
      if (piece) segments.push(piece.trim());
      continue;
    }

    if (current.length + sentence.length + 1 > maxChars) {
      push();
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  push();

  return segments.length > 0 ? segments : [text];
}
