/**
 * FreeLM — suggest a focus prompt.
 *
 * POST /api/notebooks/:id/studio/suggest
 *
 * Powers the sparkles button in the Studio customize dialogs: it reads the
 * notebook's sources and proposes a grounded focus.
 */

import { NextResponse } from 'next/server';

import { getChatProvider } from '@/lib/ai';
import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, resolveNotebook } from '@/lib/api/helpers';
import { renderContext, sourceNames } from '@/lib/rag/context';
import { retrieveCoverageChunks } from '@/lib/rag/retrieval';

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

    const body = (await request.json().catch(() => ({}))) as {
      sourceIds?: string[];
    };

    const chunks = await retrieveCoverageChunks({
      notebookId,
      ...(body.sourceIds?.length ? { sourceIds: body.sourceIds } : {}),
      perSource: 4,
      maxTotal: 20,
    });

    if (chunks.length === 0) {
      return NextResponse.json({ suggestion: '' });
    }

    const provider = getChatProvider();
    const raw = await provider.chat(
      [
        {
          role: 'user',
          content: [
            'Based on the CONTEXT below, write ONE short sentence that a user could use as a focus prompt for a study artifact.',
            'It must name a specific angle, topic or comparison that is actually present in the context.',
            'Do not add quotes, bullet points or preamble. One sentence, under 20 words.',
            '',
            `CONTEXT:\n${renderContext(chunks)}`,
            '',
            `SOURCES: ${sourceNames(chunks).join(', ')}`,
          ].join('\n'),
        },
      ],
      { maxTokens: 80, temperature: 0.6 },
    );

    return NextResponse.json({ suggestion: raw.trim().replace(/^["']|["']$/g, '') });
  } catch (error) {
    return jsonError(error);
  }
}
