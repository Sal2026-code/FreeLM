/**
 * FreeLM — add a YouTube source.
 *
 * POST /api/notebooks/:id/sources/youtube
 */

import { NextResponse } from 'next/server';

import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, resolveNotebook } from '@/lib/api/helpers';
import { createSource } from '@/lib/api/sources';
import { extractYouTube, parseYouTubeId } from '@/lib/ingest/extract';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getOrCreateSession();
    const notebookId = context.params.id;
    const resolved = await resolveNotebook(notebookId, session);
    if (!resolved.ok) return resolved.response;

    const body = (await request.json()) as { url?: string; title?: string };
    const rawUrl = body.url?.trim() ?? '';

    if (!rawUrl) {
      return badRequest('Enter the address of the YouTube video to add.');
    }

    if (!parseYouTubeId(rawUrl)) {
      return badRequest('That does not look like a YouTube video link.');
    }

    let extracted;
    try {
      extracted = await extractYouTube(rawUrl);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not read that video’s transcript.';
      return badRequest(message, 'YOUTUBE_FAILED');
    }

    const source = await createSource({
      notebookId,
      title: body.title?.trim() || extracted.title,
      type: 'youtube',
      extractedText: extracted.text,
      metadata: {
        url: rawUrl,
        videoId: extracted.videoId,
        ...(extracted.author ? { author: extracted.author } : {}),
      },
    });

    return NextResponse.json(source);
  } catch (error) {
    return jsonError(error);
  }
}
