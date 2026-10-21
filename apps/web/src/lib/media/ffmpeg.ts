/**
 * FreeLM — ffmpeg wrapper.
 *
 * `ffmpeg-static` ships a prebuilt binary, so no system install is needed.
 * Every call is a promise that resolves on exit code 0 and rejects with the
 * tail of stderr otherwise.
 */

import { spawn } from 'node:child_process';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import ffmpegPath from 'ffmpeg-static';

export function getFfmpegPath(): string {
  if (!ffmpegPath) {
    throw new Error(
      'ffmpeg is unavailable. Reinstall dependencies so ffmpeg-static can place its binary.',
    );
  }
  return ffmpegPath;
}

export interface FfmpegResult {
  stdout: string;
  stderr: string;
}

export function runFfmpeg(args: string[]): Promise<FfmpegResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(getFfmpegPath(), args, {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `ffmpeg exited with code ${code}:\n${stderr.slice(-1200)}`,
          ),
        );
      }
    });
  });
}

export async function ensureDirectory(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Concatenate MP3 files, inserting a short silence between them. */
export async function concatAudio(
  files: string[],
  outputPath: string,
  gapSeconds = 0.45,
): Promise<string> {
  if (files.length === 0) {
    throw new Error('No audio files to concatenate.');
  }
  if (files.length === 1) {
    await runFfmpeg(['-y', '-i', files[0]!, '-c', 'copy', outputPath]);
    return outputPath;
  }

  await ensureDirectory(path.dirname(outputPath));

  const listFile = path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath)}.concat.txt`,
  );

  const escape = (value: string) => value.replace(/'/g, "'\\''");
  const lines: string[] = [];
  for (const file of files) {
    lines.push(`file '${escape(path.resolve(file))}'`);
    if (gapSeconds > 0) {
      lines.push(
        `file '${escape(path.resolve(path.dirname(outputPath), 'silence.mp3'))}'`,
      );
    }
  }
  await writeFile(listFile, lines.join('\n'), 'utf8');

  try {
    await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c:a',
      'libmp3lame',
      '-q:a',
      '4',
      outputPath,
    ]);
  } finally {
    await unlink(listFile).catch(() => undefined);
  }

  return outputPath;
}

/** Write a short silent MP3 of the given duration. */
export async function writeSilence(
  outputPath: string,
  seconds: number,
): Promise<string> {
  await ensureDirectory(path.dirname(outputPath));
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `anullsrc=channel_layout=mono:sample_rate=24000`,
    '-t',
    String(seconds),
    '-c:a',
    'libmp3lame',
    '-q:a',
    '9',
    outputPath,
  ]);
  return outputPath;
}

/** Get the duration of a media file in seconds. */
export async function probeDuration(filePath: string): Promise<number | null> {
  try {
    const { stderr } = await runFfmpeg(['-i', filePath, '-f', 'null', '-']);
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (!match) return null;
    const [, h = '0', m = '0', s = '0'] = match;
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  } catch {
    return null;
  }
}
