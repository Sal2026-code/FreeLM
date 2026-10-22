/**
 * FreeLM — notebook settings.
 *
 * GET   /api/notebooks/:id/settings   read
 * PATCH /api/notebooks/:id/settings   update (custom instructions, mode, …)
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, notFound, readJson } from '@/lib/api/helpers';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id } = context.params;

    const [notebook] = await db
      .select({ id: schema.notebooks.id })
      .from(schema.notebooks)
      .where(eq(schema.notebooks.id, id))
      .limit(1);
    if (!notebook) return notFound('That notebook does not exist.');

    let [settings] = await db
      .select()
      .from(schema.notebookSettings)
      .where(eq(schema.notebookSettings.notebookId, id))
      .limit(1);

    if (!settings) {
      [settings] = await db
        .insert(schema.notebookSettings)
        .values({ notebookId: id })
        .returning();
    }

    return NextResponse.json(settings);
  } catch (error) {
    return jsonError(error);
  }
}

interface PatchBody {
  customInstructions?: string;
  chatMode?: 'exploratory' | 'analytical' | 'study' | 'creative' | 'instructional' | 'synthesis';
  responseLength?: 'short' | 'medium' | 'long';
  defaultScope?: 'all' | 'selected';
  retrievalK?: number;
  outputLanguage?: string;
}

const MODES = [
  'exploratory',
  'analytical',
  'study',
  'creative',
  'instructional',
  'synthesis',
] as const;

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const { id } = context.params;
    const body = await readJson<PatchBody>(request);

    const [notebook] = await db
      .select({ id: schema.notebooks.id })
      .from(schema.notebooks)
      .where(eq(schema.notebooks.id, id))
      .limit(1);
    if (!notebook) return notFound('That notebook does not exist.');

    const patch: Partial<typeof schema.notebookSettings.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (typeof body.customInstructions === 'string') {
      patch.customInstructions = body.customInstructions.slice(0, 4000);
    }
    if (body.chatMode && MODES.includes(body.chatMode)) {
      patch.chatMode = body.chatMode;
    }
    if (body.responseLength === 'short' || body.responseLength === 'medium' || body.responseLength === 'long') {
      patch.responseLength = body.responseLength;
    }
    if (body.defaultScope === 'all' || body.defaultScope === 'selected') {
      patch.defaultScope = body.defaultScope;
    }
    if (typeof body.retrievalK === 'number') {
      // FreeLM does not cap retrieval depth — the only bound is what the
      // provider's context window can hold.
      patch.retrievalK = Math.min(Math.max(Math.round(body.retrievalK), 4), 200);
    }
    if (typeof body.outputLanguage === 'string' && body.outputLanguage) {
      patch.outputLanguage = body.outputLanguage.slice(0, 16);
    }

    const [settings] = await db
      .insert(schema.notebookSettings)
      .values({ notebookId: id, ...patch })
      .onConflictDoUpdate({
        target: schema.notebookSettings.notebookId,
        set: patch,
      })
      .returning();

    return NextResponse.json(settings);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(): Promise<NextResponse> {
  return badRequest('Use PATCH to update notebook settings.');
}
