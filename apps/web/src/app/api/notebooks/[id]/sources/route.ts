/**
 * FreeLM — sources list.
 *
 * GET /api/notebooks/:id/sources
 */

import { NextResponse } from 'next/server';

import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, notFound, resolveNotebook } from '@/lib/api/helpers';
import { listSources } from '@/lib/api/queries';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const resolved = await resolveNotebook(context.params.id, session);
    if (!resolved.ok) return resolved.response;

    return NextResponse.json(await listSources(context.params.id));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(): Promise<NextResponse> {
  return notFound('Use one of the source sub-endpoints to add a source.');
}
