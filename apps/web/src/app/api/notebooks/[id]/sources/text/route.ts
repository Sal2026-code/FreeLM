/**
 * FreeLM — add a pasted-text source.
 *
 * POST /api/notebooks/:id/sources/text
 */

import { NextResponse } from 'next/server';

import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, resolveNotebook } from '@/lib/api/helpers';
import { createSource } from '@/lib/api/sources';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const notebookId = context.params.id;
    const resolved = await resolveNotebook(notebookId, session);
    if (!resolved.ok) return resolved.response;

    const body = (await request.json()) as { title?: string; text?: string };
    const text = body.text?.trim() ?? '';

    if (!text) {
      return badRequest('Paste some text to add as a source.');
    }

    const source = await createSource({
      notebookId,
      title: body.title?.trim() || 'Copied text',
      type: 'text',
      extractedText: text,
      metadata: {
        wordCount: text.split(/\s+/).length,
      },
    });

    return NextResponse.json(source);
  } catch (error) {
    return jsonError(error);
  }
}
