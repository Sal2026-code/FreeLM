/**
 * FreeLM — Studio generation.
 *
 * POST /api/notebooks/:id/studio/generate
 *
 * Fast tools (reports, quizzes, decks, tables, mind maps, …) are generated
 * inline so the user gets the artifact immediately. Media tools (Audio and
 * Video Overviews) take minutes, so they are queued and the client is
 * notified over the workspace event stream.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import type { StudioToolType } from '@freelm/shared';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, resolveNotebook } from '@/lib/api/helpers';
import { publishEvent } from '@/lib/events';
import { enqueueStudio } from '@/lib/queue';
import {
  STUDIO_GENERATORS,
  type GeneratorResult,
} from '@/lib/studio/generators';
import { finaliseOutput } from '@/lib/studio/finalise';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MEDIA_TOOLS: StudioToolType[] = ['audio_overview', 'video_overview'];

interface GenerateBody {
  type?: StudioToolType;
  sourceIds?: string[];
  prompt?: string;
  language?: string;
  length?: 'short' | 'medium' | 'long';
  tone?: 'simple' | 'academic' | 'conversational';
  level?: 'beginner' | 'intermediate' | 'expert';
  options?: Record<string, unknown>;
}

export async function POST(
  request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const notebookId = context.params.id;
    const resolved = await resolveNotebook(notebookId, session);
    if (!resolved.ok) return resolved.response;

    const body = (await request.json()) as GenerateBody;
    const type = body.type;

    if (!type || !(type in STUDIO_GENERATORS)) {
      return badRequest('That Studio tool is not available.');
    }

    const generator = STUDIO_GENERATORS[type]!;

    const [row] = await db
      .insert(schema.studioOutputs)
      .values({
        notebookId,
        type,
        title: 'Generating…',
        content: {},
        meta: { status: 'generating' },
        sourceIds: body.sourceIds ?? [],
      })
      .returning();

    const input = {
      notebookId,
      sourceIds: body.sourceIds ?? [],
      prompt: body.prompt ?? '',
      language: body.language ?? 'en',
      length: body.length ?? 'medium',
      tone: body.tone ?? 'conversational',
      level: body.level ?? 'intermediate',
      options: body.options ?? {},
    };

    if (MEDIA_TOOLS.includes(type)) {
      await enqueueStudio({ outputId: row!.id, notebookId, type });
      return NextResponse.json(
        {
          id: row!.id,
          notebookId,
          type,
          title: row!.title,
          content: row!.content,
          fileUrl: null,
          fileMime: null,
          meta: { status: 'queued' },
          sourceIds: row!.sourceIds as string[],
          createdAt: row!.createdAt.toISOString(),
          updatedAt: row!.updatedAt.toISOString(),
        },
        { status: 202 },
      );
    }

    const result = await generator.generate(input);
    const output = await finaliseOutput(row!.id, result);

    publishEvent(notebookId, { type: 'output', output });
    return NextResponse.json(output);
  } catch (error) {
    return jsonError(error);
  }
}
