/**
 * FreeLM — Studio outputs.
 *
 * GET /api/notebooks/:id/studio/outputs
 */

import { NextResponse } from 'next/server';

import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, resolveNotebook } from '@/lib/api/helpers';
import { listOutputs } from '@/lib/api/queries';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const resolved = await resolveNotebook(context.params.id, session);
    if (!resolved.ok) return resolved.response;
    return NextResponse.json(await listOutputs(context.params.id));
  } catch (error) {
    return jsonError(error);
  }
}
