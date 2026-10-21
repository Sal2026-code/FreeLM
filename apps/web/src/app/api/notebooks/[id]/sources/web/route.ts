/**
 * FreeLM — add a website source.
 *
 * POST /api/notebooks/:id/sources/web
 */

import { NextResponse } from 'next/server';

import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, resolveNotebook } from '@/lib/api/helpers';
import { createSource, failSource } from '@/lib/api/sources';

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
      return badRequest('Enter the address of the page to add.');
    }

    let url: URL;
    try {
      url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    } catch {
      return badRequest('That does not look like a valid web address.');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return badRequest('Only http and https addresses can be imported.');
    }

    // Fetch eagerly so the user gets an immediate, specific error.
    const { extractWebPage } = await import('@/lib/ingest/extract');
    let extracted;
    try {
      extracted = await extractWebPage(url.toString());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not read that page.';
      return badRequest(message, 'WEB_FETCH_FAILED');
    }

    if (!extracted.document.text.trim()) {
      return badRequest(
        'No readable text was found on that page. It may be behind a paywall or require JavaScript.',
        'WEB_EMPTY',
      );
    }

    const source = await createSource({
      notebookId,
      title:
        body.title?.trim() ||
        extracted.document.title ||
        extracted.finalUrl,
      type: 'web',
      extractedText: extracted.document.text,
      metadata: {
        url: extracted.finalUrl,
        originalUrl: url.toString(),
        siteName: extracted.siteName,
        ...(extracted.document.metadata as Record<string, unknown>),
      },
    });

    return NextResponse.json(source);
  } catch (error) {
    return jsonError(error);
  }
}
