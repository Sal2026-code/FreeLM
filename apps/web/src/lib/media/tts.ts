/**
 * FreeLM — text to speech.
 *
 * Three backends, chosen automatically:
 *   1. OpenAI  — highest quality, two distinct voices for the podcast hosts
 *   2. Gemini  — multi-voice, excellent multilingual coverage
 *   3. Edge    — keyless Google Translate voices, used when no API key is set
 *
 * All three return MP3 bytes, which is what the audio pipeline expects.
 */

import { env } from '@/lib/env';
import { getChatProvider } from '@/lib/ai';
import { UpstreamError } from '@/lib/ai/errors';
import { getLanguage, hostVoices, type Language } from '@freelm/shared';

export type TTSBackend = 'openai' | 'gemini' | 'edge';

export interface SpeakOptions {
  /** Voice identifier for the active backend. */
  voice?: string;
  language?: string;
  speed?: number;
  instructions?: string;
}

export interface VoiceSet {
  backend: TTSBackend;
  hostA: string;
  hostB: string;
  narrator: string;
}

/** Decide which TTS backend to use and which voices to use with it. */
export function resolveVoices(languageCode = 'en'): VoiceSet {
  const language: Language = getLanguage(languageCode);

  const backend = env.FREELM_TTS_BACKEND;

  if (backend === 'edge') {
    return {
      backend: 'edge',
      hostA: edgeLocale(language),
      hostB: edgeAlternateVoice(language),
      narrator: edgeLocale(language),
    };
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
      hostB: 'Charon',
      narrator: language.gemini ?? 'Kore',
    };
  }

  if (
    backend === 'openai' ||
    (backend === 'auto' && env.FREELM_OPENAI_API_KEY)
  ) {
    return {
      backend: 'openai',
      hostA: 'shimmer',
      hostB: 'onyx',
      narrator: 'shimmer',
    };
  }

  if (backend === 'auto' && env.FREELM_AI_PROVIDER === 'openai-compatible') {
    // An OpenAI-compatible endpoint may or may not expose /audio/speech, so
    // the keyless backend is the safe default.
    return {
      backend: 'edge',
      hostA: edgeLocale(language),
      hostB: edgeAlternateVoice(language),
      narrator: edgeLocale(language),
    };
  }

  return {
    backend: 'edge',
    hostA: edgeLocale(language),
    hostB: edgeAlternateVoice(language),
    narrator: edgeLocale(language),
  };
}

/**
 * The locale the keyless voice endpoint understands.
 *
 * The endpoint picks a voice from the locale (it rejects full Edge voice
 * names), so `en-US-AriaNeural` becomes `en-US`.
 */
function edgeLocale(language: Language): string {
  const voice = language.edge ?? 'en-US-AriaNeural';
  const parts = voice.split('-');
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`;
  }
  return language.bcp47;
}

/**
 * A second voice for the same language, for the two-host dialogue.
 *
 * The keyless Google Translate voice endpoint selects a voice from the
 * locale, so the two hosts use different regional variants of the same
 * language. That gives a genuinely different speaker for each side without
 * needing an API key.
 */
function edgeAlternateVoice(language: Language): string {
  const base = edgeLocale(language);
  const region = base.split('-')[1] ?? 'US';
  const alternatives: Record<string, string[]> = {
    US: ['en-GB', 'en-AU', 'en-IN', 'en-CA', 'en-ZA'],
    GB: ['en-US', 'en-AU', 'en-IN', 'en-CA', 'en-ZA'],
    AU: ['en-US', 'en-GB', 'en-IN', 'en-CA'],
    IN: ['en-US', 'en-GB', 'en-AU', 'en-CA'],
    CA: ['en-US', 'en-GB', 'en-AU', 'en-IN'],
    ZA: ['en-US', 'en-GB', 'en-AU'],
  };
  const list = alternatives[region] ?? ['en-US', 'en-GB', 'en-AU'];
  return list[0] ?? base;
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
 * The endpoint selects a voice from the locale in `tl` and returns MP3
 * bytes. It is free, needs no key, and speaks 100+ languages.
 */
async function speakEdge(
  text: string,
  voice: string,
  language: Language,
  options: SpeakOptions,
): Promise<Buffer> {
  const url = new URL('https://translate.google.com/translate_tts');
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('tl', voice || language.bcp47);
  url.searchParams.set('q', text.slice(0, 1800));

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

/** Split a long script into speakable segments. */
export function segmentForSpeech(text: string, maxChars = 1800): string[] {
  if (text.length <= maxChars) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const segments: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > maxChars && current) {
      segments.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) segments.push(current);
  return segments;
}
