/**
 * FreeLM — Fast Research.
 *
 * POST /api/notebooks/:id/search
 *
 * Body: { query: string, mode?: 'fast' | 'deep' }
 *
 * Fast Research returns candidate sources the user can review and import.
 * Deep Research additionally synthesises a report that becomes a new source.
 */

import { NextResponse } from 'next/server';

import { getOrCreateSession } from '@/lib/auth/session';
import { badRequest, jsonError, resolveNotebook } from '@/lib/api/helpers';
import { searchWeb } from '@/lib/search';
import { createSource } from '@/lib/api/sources';
import { getChatProvider } from '@/lib/ai';
import { buildDeepResearchPrompt } from '@/lib/ai/prompts';

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
      query?: string;
      mode?: 'fast' | 'deep';
    };
    const query = body.query?.trim() ?? '';
    if (!query) return badRequest('Enter something to research.');

    const candidates = await searchWeb(query, 10);

    if (body.mode !== 'deep') {
      return NextResponse.json({ candidates });
    }

    // Deep Research: synthesise a report from the findings and add it as a
    // source of its own.
    const provider = getChatProvider();
    const report = await provider.chat(
      [
        {
          role: 'user',
          content: buildDeepResearchPrompt({ query, findings: candidates, language: 'en' }),
        },
      ],
      { maxTokens: 4000, temperature: 0.4 },
    );

    const source = await createSource({
      notebookId,
      title: `Deep Research — ${query}`,
      type: 'research',
      extractedText: report,
      metadata: { query, mode: 'deep' },
    });

    return NextResponse.json({ candidates, report, source });
  } catch (error) {
    return jsonError(error);
  }
}
