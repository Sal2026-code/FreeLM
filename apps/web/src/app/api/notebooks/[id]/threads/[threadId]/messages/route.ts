/**
 * FreeLM — chat messages.
 *
 * GET    /api/notebooks/:id/threads/:threadId/messages
 * POST   /api/notebooks/:id/threads/:threadId/messages   (non-streaming)
 * DELETE /api/notebooks/:id/threads/:threadId/messages   (clear history)
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, notFound, resolveNotebook } from '@/lib/api/helpers';
import { listMessages } from '@/lib/api/queries';
import { askQuestion } from '@/lib/chat/answer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface RouteContext {
  params: { id: string; threadId: string };
}

async function threadBelongsToNotebook(
  notebookId: string,
  threadId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.threads.id })
    .from(schema.threads)
    .where(
      and(
        eq(schema.threads.id, threadId),
        eq(schema.threads.notebookId, notebookId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, threadId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    if (!(await threadBelongsToNotebook(id, threadId))) {
      return notFound('That chat does not exist.');
    }

    return NextResponse.json(await listMessages(threadId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, threadId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    if (!(await threadBelongsToNotebook(id, threadId))) {
      return notFound('That chat does not exist.');
    }

    const body = (await request.json()) as {
      content?: string;
      mode?: 'exploratory' | 'analytical' | 'study' | 'creative' | 'instructional' | 'synthesis';
      scope?: 'all' | 'selected';
      sourceIds?: string[];
      length?: 'short' | 'medium' | 'long';
    };

    const content = body.content?.trim();
    if (!content) {
      return badRequest('Type a question first.');
    }

    const result = await askQuestion({
      notebookId: id,
      threadId,
      content,
      ...(body.mode ? { mode: body.mode } : {}),
      ...(body.scope ? { scope: body.scope } : {}),
      ...(body.sourceIds ? { sourceIds: body.sourceIds } : {}),
      ...(body.length ? { length: body.length } : {}),
    });

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id, threadId } = context.params;
    const resolved = await resolveNotebook(id, session);
    if (!resolved.ok) return resolved.response;

    await db
      .delete(schema.messages)
      .where(eq(schema.messages.threadId, threadId));

    // Reset the title so the thread behaves like a fresh chat.
    await db
      .update(schema.threads)
      .set({ title: 'New chat', updatedAt: new Date() })
      .where(eq(schema.threads.id, threadId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
