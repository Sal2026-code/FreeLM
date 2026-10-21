/**
 * FreeLM — Studio worker.
 *
 * Run with:  npm run worker:studio --workspace=@freelm/web
 *
 * Handles the slow media tools: Audio Overviews (real `.mp3`) and Video
 * Overviews (real `.mp4`). Everything else is generated inline.
 */

import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { env } from '@/lib/env';
import { STUDIO_QUEUE, type StudioJobData } from '@/lib/queue';
import { publishEvent } from '@/lib/events';
import { db, schema } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { buildAudioOverview } from '@/lib/media/audio';
import { buildVideoOverview } from '@/lib/media/video';
import { renderInfographic } from '@/lib/media/slides';
import { STUDIO_GENERATORS } from '@/lib/studio/generators';
import { finaliseOutput } from '@/lib/studio/finalise';
import type { AudioOverviewContent, VideoOverviewContent } from '@freelm/shared';

/** Media is rendered in a scratch directory; the artifact is stored by
 *  `finaliseOutput` once it is finished. */
const tmpDir = mkdtempSync(path.join(tmpdir(), 'freelm-studio-'));

const worker = new Worker<StudioJobData>(
  STUDIO_QUEUE,
  async (job) => {
    const { outputId, notebookId, type } = job.data;

    const [row] = await db
      .select()
      .from(schema.studioOutputs)
      .where(eq(schema.studioOutputs.id, outputId))
      .limit(1);

    if (!row) {
      return { ok: false, error: 'Output not found.' };
    }

    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const language = (meta.language as string | undefined) ?? 'en';

    try {
      if (type === 'audio_overview') {
        const content = row.content as unknown as AudioOverviewContent;
        const generator = STUDIO_GENERATORS.audio_overview;
        if (!generator) throw new Error('Audio generator missing.');

        // The script may already exist; if not, generate it now.
        let script = content;
        if (!script?.transcript?.length) {
          const result = await generator.generate({
            notebookId,
            sourceIds: (row.sourceIds ?? []) as string[],
            prompt: (meta.prompt as string | undefined) ?? '',
            language,
            length: 'medium',
            tone: 'conversational',
            level: 'intermediate',
            options: meta,
          });
          script = result.content as AudioOverviewContent;
        }

        const storage = getStorage();
        const key = `${notebookId}/${outputId}.mp3`;
        const built = await buildAudioOverview({
          turns: script.transcript.map((turn) => ({
            speaker: turn.speaker,
            text: turn.text,
          })),
          language,
          outputPath: path.join(tmpDir, `${outputId}.mp3`),
          onProgress: (progress) => {
            void db
              .update(schema.studioOutputs)
              .set({ meta: { ...meta, status: 'generating', progress } })
              .where(eq(schema.studioOutputs.id, outputId));
          },
        });

        // `finaliseOutput` persists the artifact; the local copy is only a
        // build artefact and is removed afterwards.
        const output = await finaliseOutput(outputId, {
          title: script.title,
          content: script,
          meta: {
            ...meta,
            status: 'ready',
            needsMedia: false,
            durationSeconds: built.durationSeconds,
          },
          citationChunkIds: script.citationChunkIds ?? [],
          file: { buffer: built.buffer, mimeType: 'audio/mpeg', extension: 'mp3' },
        });
        void storage;
        publishEvent(notebookId, { type: 'output', output });
        return { ok: true, outputId };
      }

      if (type === 'video_overview') {
        const content = row.content as unknown as VideoOverviewContent;
        const generator = STUDIO_GENERATORS.video_overview;
        if (!generator) throw new Error('Video generator missing.');

        let script = content;
        if (!script?.scenes?.length) {
          const result = await generator.generate({
            notebookId,
            sourceIds: (row.sourceIds ?? []) as string[],
            prompt: (meta.prompt as string | undefined) ?? '',
            language,
            length: 'medium',
            tone: 'conversational',
            level: 'intermediate',
            options: meta,
          });
          script = result.content as VideoOverviewContent;
        }

        const storage = getStorage();
        const key = `${notebookId}/${outputId}.mp4`;
        const built = await buildVideoOverview({
          title: script.title,
          scenes: script.scenes.map((scene) => ({
            heading: scene.heading,
            bullets: scene.bullets,
            narration: scene.narration,
          })),
          style: (script.style ?? 'professional') as never,
          language,
          outputPath: path.join(tmpDir, `${outputId}.mp4`),
          onProgress: (progress) => {
            void db
              .update(schema.studioOutputs)
              .set({ meta: { ...meta, status: 'generating', progress } })
              .where(eq(schema.studioOutputs.id, outputId));
          },
        });

        const output = await finaliseOutput(outputId, {
          title: script.title,
          content: script,
          meta: {
            ...meta,
            status: 'ready',
            needsMedia: false,
            durationSeconds: built.durationSeconds,
          },
          citationChunkIds: (script as { citationChunkIds?: string[] })
            .citationChunkIds ?? [],
          file: { buffer: built.buffer, mimeType: 'video/mp4', extension: 'mp4' },
        });
        void storage;
        publishEvent(notebookId, { type: 'output', output });
        return { ok: true, outputId };
      }

      if (type === 'infographic') {
        const content = row.content as {
          title: string;
          subtitle: string;
          sections: { heading: string; bullets: string[] }[];
          palette: string;
        };
        const buffer = await renderInfographic({
          ...content,
          footer: 'Generated by FreeLM',
        });
        const output = await finaliseOutput(outputId, {
          title: content.title,
          content,
          meta: { ...meta, status: 'ready' },
          citationChunkIds: [],
          file: { buffer, mimeType: 'image/png', extension: 'png' },
        });
        publishEvent(notebookId, { type: 'output', output });
        return { ok: true, outputId };
      }

      return { ok: false, error: `No worker handler for "${type}".` };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Generation failed.';
      await db
        .update(schema.studioOutputs)
        .set({ meta: { ...meta, status: 'error', error: message } })
        .where(eq(schema.studioOutputs.id, outputId));

      const [failed] = await db
        .select()
        .from(schema.studioOutputs)
        .where(eq(schema.studioOutputs.id, outputId))
        .limit(1);

      if (failed) {
        publishEvent(notebookId, { type: 'output', output: {
          id: failed.id,
          notebookId: failed.notebookId,
          type: failed.type,
          title: failed.title,
          content: failed.content,
          fileUrl: failed.fileUrl,
          fileMime: failed.fileMime,
          meta: (failed.meta ?? {}) as Record<string, unknown>,
          sourceIds: (failed.sourceIds ?? []) as string[],
          createdAt: failed.createdAt.toISOString(),
          updatedAt: failed.updatedAt.toISOString(),
        } });
      }
      return { ok: false, error: message };
    }
  },
  {
    connection: {
      url: env.FREELM_REDIS_URL,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
    concurrency: 2,
  },
);

worker.on('completed', (job, result) => {
  console.log(`[studio] ${job.id} completed`, result);
});

worker.on('failed', (job, error) => {
  console.error(`[studio] ${job?.id ?? 'unknown'} failed:`, error.message);
});

console.log('[studio] FreeLM studio worker started');

async function shutdown(): Promise<void> {
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
