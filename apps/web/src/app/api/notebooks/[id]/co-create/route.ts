/**
 * FreeLM — co-creation (the October 2026 "review before you render" flow).
 *
 * POST  /api/notebooks/:id/co-create           propose topics and an outline
 * PATCH /api/notebooks/:id/co-create/:sessionId  edit the plan, then render
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, notFound, resolveNotebook } from '@/lib/api/helpers';
import { buildCoCreationPlan } from '@/lib/studio/generators';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const notebookId = context.params.id;
    const resolved = await resolveNotebook(notebookId, session);
    if (!resolved.ok) return resolved.response;

    const body = (await request.json()) as {
      artifactType?: 'slide_deck' | 'video_overview';
      prompt?: string;
      sourceIds?: string[];
    };

    const artifactType = body.artifactType ?? 'slide_deck';
    if (artifactType !== 'slide_deck' && artifactType !== 'video_overview') {
      return badRequest('Choose a slide deck or a video overview.');
    }

    const plan = await buildCoCreationPlan({
      notebookId,
      sourceIds: body.sourceIds ?? [],
      artifactType,
      prompt: body.prompt ?? '',
    });

    const [row] = await db
      .insert(schema.coCreationSessions)
      .values({
        notebookId,
        artifactType,
        prompt: body.prompt ?? '',
        plan: plan as unknown as Record<string, unknown>,
        status: 'draft',
      })
      .returning();

    return NextResponse.json({ id: row!.id, ...plan, status: 'draft' });
  } catch (error) {
    return jsonError(error);
  }
}
