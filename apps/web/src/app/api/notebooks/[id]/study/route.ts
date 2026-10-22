/**
 * FreeLM — study sessions.
 *
 * POST /api/notebooks/:id/study
 *
 * Records a quiz or flashcard attempt so the user can later ask their
 * notebook "how did I do?" and get grounded feedback on their own results.
 */

import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, resolveNotebook } from '@/lib/api/helpers';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const resolved = await resolveNotebook(context.params.id, session);
    if (!resolved.ok) return resolved.response;

    const rows = await db
      .select()
      .from(schema.studySessions)
      .where(eq(schema.studySessions.notebookId, context.params.id))
      .orderBy(desc(schema.studySessions.createdAt));

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        notebookId: row.notebookId,
        outputId: row.outputId,
        kind: row.kind,
        answers: row.answers,
        rightCount: row.rightCount,
        wrongCount: row.wrongCount,
        skippedCount: row.skippedCount,
        topics: row.topics,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  } catch (error) {
    return jsonError(error);
  }
}

interface StudyBody {
  outputId?: string;
  kind?: 'quiz' | 'flashcards';
  answers?: Record<string, string | string[]>;
  rightCount?: number;
  wrongCount?: number;
  skippedCount?: number;
  topics?: string[];
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

    const body = (await request.json()) as StudyBody;
    if (!body.outputId) return badRequest('Missing the output id.');

    const [row] = await db
      .insert(schema.studySessions)
      .values({
        notebookId,
        outputId: body.outputId,
        kind: body.kind ?? 'quiz',
        answers: body.answers ?? {},
        rightCount: body.rightCount ?? 0,
        wrongCount: body.wrongCount ?? 0,
        skippedCount: body.skippedCount ?? 0,
        topics: body.topics ?? [],
      })
      .returning();

    return NextResponse.json({
      id: row!.id,
      notebookId,
      outputId: row!.outputId,
      kind: row!.kind,
      answers: row!.answers,
      rightCount: row!.rightCount,
      wrongCount: row!.wrongCount,
      skippedCount: row!.skippedCount,
      topics: row!.topics,
      createdAt: row!.createdAt.toISOString(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
