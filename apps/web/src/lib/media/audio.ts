/**
 * FreeLM — Audio Overview builder.
 *
 * Produces a real, playable, downloadable `.mp3`:
 *   1. The LLM writes a grounded two-host dialogue.
 *   2. Each turn is synthesised with a distinct host voice.
 *   3. ffmpeg concatenates the turns with short silences between them.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { concatAudio, ensureDirectory, probeDuration, writeSilence } from './ffmpeg';
import { resolveVoices, segmentForSpeech, speak } from './tts';

export interface AudioTurn {
  speaker: string;
  text: string;
}

export interface BuildAudioOptions {
  turns: AudioTurn[];
  language: string;
  outputPath: string;
  /** Called with 0-1 progress. */
  onProgress?: (progress: number) => void;
}

export interface BuiltMedia {
  /** Where the file was written. */
  path: string;
  /** The rendered bytes. */
  buffer: Buffer;
  /** Duration in seconds, when it could be determined. */
  durationSeconds: number | null;
}

/**
 * Build the MP3. Returns the path to the finished file.
 */
export async function buildAudioOverview(
  options: BuildAudioOptions,
): Promise<BuiltMedia> {
  const { turns, language, outputPath } = options;
  if (turns.length === 0) {
    throw new Error('The audio script is empty.');
  }

  const workDir = `${outputPath}.work`;
  await ensureDirectory(workDir);
  await ensureDirectory(path.dirname(outputPath));

  const voices = resolveVoices(language);
  const parts: string[] = [];

  try {
    for (let index = 0; index < turns.length; index += 1) {
      const turn = turns[index];
      if (!turn) continue;

      const isHostB = /host\s*b|host\s*2|guest|co-?host/i.test(turn.speaker);
      const voice = isHostB ? voices.hostB : voices.hostA;

      const segments = segmentForSpeech(turn.text);
      const turnFiles: string[] = [];

      for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
        const segment = segments[segmentIndex];
        if (!segment) continue;
        const file = path.join(
          workDir,
          `turn-${String(index).padStart(3, '0')}-${segmentIndex}.mp3`,
        );
        const audio = await speak(segment, { voice, language });
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, audio);
        turnFiles.push(file);
      }

      if (turnFiles.length === 1) {
        parts.push(turnFiles[0] as string);
      } else {
        const merged = path.join(
          workDir,
          `turn-${String(index).padStart(3, '0')}.mp3`,
        );
        await concatAudio(turnFiles, merged, 0.2);
        parts.push(merged);
      }

      options.onProgress?.((index + 1) / turns.length);
    }

    // A short silence between turns gives the hosts a natural rhythm.
    const silence = path.join(workDir, 'silence.mp3');
    await writeSilence(silence, 0.45);

    await concatAudio(parts, outputPath, 0.45);
    const buffer = await readFile(outputPath);
    const durationSeconds = await probeDuration(outputPath);
    return { path: outputPath, buffer, durationSeconds };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Transcribe an existing audio overview so the player can show a synced
 * transcript. Uses the same TTS provider family when a transcription
 * endpoint is available.
 */
export async function transcribeAudio(
  filePath: string,
): Promise<string | null> {
  try {
    const { readFile } = await import('node:fs/promises');
    const { env } = await import('@/lib/env');

    const baseUrl =
      env.FREELM_AI_PROVIDER === 'openai-compatible'
        ? env.FREELM_OPENAI_COMPATIBLE_BASE_URL
        : env.FREELM_OPENAI_BASE_URL;
    if (!baseUrl) return null;

    const buffer = await readFile(filePath);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)]), 'audio.mp3');
    form.append('model', 'whisper-1');

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: env.FREELM_OPENAI_API_KEY
        ? { Authorization: `Bearer ${env.FREELM_OPENAI_API_KEY}` }
        : {},
      body: form,
    });
    if (!response.ok) return null;
    return (await response.text()).trim();
  } catch {
    return null;
  }
}
