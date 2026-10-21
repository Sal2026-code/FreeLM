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

  if (env.FREELM_AI_PROVIDER === 'gemini' && env.FREELM_GEMINI_API_KEY) {
    return {
      backend: 'gemini',
      hostA: language.gemini ?? 'Kore',
      hostB: 'Charon',
      narrator: language.gemini ?? 'Kore',
    };
  }

  if (
    (env.FREELM_AI_PROVIDER === 'openai' || env.FREELM_AI_PROVIDER === 'openai-compatible') &&
    env.FREELM_OPENAI_API_KEY
  ) {
    return {
      backend: 'openai',
      hostA: 'shimmer',
      hostB: 'onyx',
      narrator: 'shimmer',
    };
  }

  return {
    backend: 'edge',
    hostA: language.edge ?? 'en-US-AriaNeural',
    hostB: edgeAlternateVoice(language),
    narrator: language.edge ?? 'en-US-AriaNeural',
  };
}

/** A second voice for the same language, for the two-host dialogue. */
function edgeAlternateVoice(language: Language): string {
  const base = language.edge ?? 'en-US-AriaNeural';
  const candidates = ['GuyNeural', 'EricNeural', 'AndrewNeural', 'DavisNeural'];
  const found = candidates.find((candidate) =>
    base.includes(candidate.replace('Neural', '')),
  );
  if (found) {
    return base.replace(found, found);
  }
  // Swap the gendered portion of the Edge voice name.
  const male = [
    'en-US-GuyNeural',
    'en-GB-RyanNeural',
    'de-DE-ConradNeural',
    'es-ES-AlvaroNeural',
    'fr-FR-HenriNeural',
    'it-IT-DiegoNeural',
    'ja-JP-KeitaNeural',
    'pt-BR-DanielNeural',
    'hi-IN-MadhurNeural',
    'ko-KR-InJoonNeural',
    'zh-CN-YunxiNeural',
  ];
  const fallback = male.find((voice) => voice.startsWith(language.code.split('-')[0] ?? ''));
  return fallback ?? base.replace(/Neural$/, 'Neural');
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
 * The `tw-ob` client accepts full Edge voice names in the `tl` parameter,
 * which is how FreeLM gets distinct male and female hosts with no API key.
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
  url.searchParams.set('q', text.slice(0, 1800));

  if (options.speed !== undefined) {
    url.searchParams.set('ttsspeed', String(options.speed));
  }

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
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
