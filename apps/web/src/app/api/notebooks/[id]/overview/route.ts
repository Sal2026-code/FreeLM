/**
 * FreeLM — notebook overview (the pinned card at the top of the chat).
 *
 * GET  /api/notebooks/:id/overview   read the stored overview
 * POST /api/notebooks/:id/overview   regenerate it
 */

import { NextResponse } from 'next/server';

import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, resolveNotebook } from '@/lib/api/helpers';
import { getStoredOverview, refreshOverview } from '@/lib/studio/overview';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(
  _request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const resolved = await resolveNotebook(context.params.id, session);
    if (!resolved.ok) return resolved.response;
    return NextResponse.json(await getStoredOverview(context.params.id));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  _request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const resolved = await resolveNotebook(context.params.id, session);
    if (!resolved.ok) return resolved.response;
    return NextResponse.json(await refreshOverview(context.params.id));
  } catch (error) {
    return jsonError(error);
  }
}
