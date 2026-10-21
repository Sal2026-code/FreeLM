/**
 * FreeLM — Video Overview builder.
 *
 * Produces a real, playable, downloadable `.mp4`:
 *   1. The LLM writes a scene plan.
 *   2. Each scene is rendered to a PNG slide with @napi-rs/canvas.
 *   3. Each scene's narration is synthesised with TTS.
 *   4. ffmpeg renders each slide+audio pair and concatenates the result.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ensureDirectory, probeDuration, runFfmpeg } from './ffmpeg';
import { renderSlide, type SlideStyle } from './slides';
import { resolveVoices, segmentForSpeech, speak } from './tts';

export interface VideoScene {
  heading: string;
  bullets: string[];
  narration: string;
  footer?: string;
}

export interface BuildVideoOptions {
  title: string;
  scenes: VideoScene[];
  style: SlideStyle;
  language: string;
  outputPath: string;
  onProgress?: (progress: number) => void;
}

export interface BuiltMedia {
  path: string;
  buffer: Buffer;
  durationSeconds: number | null;
}

export async function buildVideoOverview(
  options: BuildVideoOptions,
): Promise<BuiltMedia> {
  const { title, scenes, style, language, outputPath } = options;
  if (scenes.length === 0) {
    throw new Error('The video has no scenes.');
  }

  const workDir = `${outputPath}.work`;
  await ensureDirectory(workDir);
  await ensureDirectory(path.dirname(outputPath));

  const voices = resolveVoices(language);
  const segmentFiles: string[] = [];

  try {
    // Title slide
    const titleImage = path.join(workDir, 'slide-000.png');
    const titlePng = await renderSlide(
      {
        isTitle: true,
        title,
        subtitle: 'An overview generated from your sources',
        heading: title,
        bullets: [],
        footer: 'FreeLM',
      },
      { style },
    );
    await writeFile(titleImage, titlePng);
    segmentFiles.push(
      await renderSegment({
        image: titleImage,
        audio: null,
        output: path.join(workDir, 'segment-000.mp4'),
        durationSeconds: 3.2,
      }),
    );

    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      if (!scene) continue;

      const image = path.join(workDir, `slide-${String(index + 1).padStart(3, '0')}.png`);
      const png = await renderSlide(
        {
          heading: scene.heading,
          bullets: scene.bullets,
          footer: scene.footer,
        },
        { style },
      );
      await writeFile(image, png);

      // Narration audio
      const audioPath = path.join(workDir, `narration-${String(index).padStart(3, '0')}.mp3`);
      const segments = segmentForSpeech(scene.narration);
      const audioBuffers: Buffer[] = [];
      for (const segment of segments) {
        audioBuffers.push(
          await speak(segment, { voice: voices.narrator, language }),
        );
      }
      const audio = Buffer.concat(audioBuffers);
      await writeFile(audioPath, audio);

      const segmentFile = await renderSegment({
        image,
        audio: audioPath,
        output: path.join(workDir, `segment-${String(index + 1).padStart(3, '0')}.mp4`),
        durationSeconds: null,
      });
      segmentFiles.push(segmentFile);

      options.onProgress?.((index + 1) / scenes.length);
    }

    // Concatenate the rendered segments.
    const listFile = path.join(workDir, 'concat.txt');
    const list = segmentFiles
      .map((file) => `file '${path.resolve(file).replace(/'/g, "'\\''")}'`)
      .join('\n');
    await writeFile(listFile, list, 'utf8');

    await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'medium',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath,
    ]);

    const buffer = await readFile(outputPath);
    const durationSeconds = await probeDuration(outputPath);
    return { path: outputPath, buffer, durationSeconds };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Turn one image (+ optional audio) into an H.264 segment.
 */
async function renderSegment(params: {
  image: string;
  audio: string | null;
  output: string;
  durationSeconds: number | null;
}): Promise<string> {
  const args = ['-y', '-loop', '1', '-i', params.image];

  if (params.audio) {
    args.push('-i', params.audio);
  }

  args.push(
    '-c:v',
    'libx264',
    '-tune',
    'stillimage',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
  );

  if (params.audio) {
    args.push('-shortest');
  } else {
    args.push('-t', String(params.durationSeconds ?? 3));
    args.push('-an');
  }

  args.push(params.output);
  await runFfmpeg(args);
  return params.output;
}

/**
 * Export a slide deck to a PDF (one page per slide) using the same renderer.
 */
export async function exportSlidesAsPdf(
  slides: { heading: string; bullets: string[]; footer?: string }[],
  outputPath: string,
  style: SlideStyle = 'professional',
): Promise<string> {
  const { PDFDocument } = await import('pdf-lib');
  const workDir = `${outputPath}.work`;
  await ensureDirectory(workDir);
  await ensureDirectory(path.dirname(outputPath));

  try {
    const document = await PDFDocument.create();
    for (const [index, slide] of slides.entries()) {
      const png = await renderSlide(
        { heading: slide.heading, bullets: slide.bullets, footer: slide.footer },
        { style },
      );
      const image = await document.embedPng(png);
      const page = document.addPage([1280, 720]);
      page.drawImage(image, { x: 0, y: 0, width: 1280, height: 720 });
      void index;
    }
    const bytes = await document.save();
    await writeFile(outputPath, Buffer.from(bytes));
    return outputPath;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
