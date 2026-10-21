/**
 * FreeLM — API route helpers.
 *
 * Standardises error responses so every endpoint fails the same way:
 *   { error: string, code: string, details?: unknown }
 *
 * Upstream AI failures surface a friendly, actionable message (see
 * `UpstreamError.userMessage`) instead of a stack trace.
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { UpstreamError } from '@/lib/ai/errors';
import { canAccessNotebook, getOrCreateSession, type AppSession } from '@/lib/auth/session';

export function jsonError(
  error: unknown,
  fallbackStatus = 500,
): NextResponse {
  if (error instanceof UpstreamError) {
    return NextResponse.json(
      { error: error.userMessage, code: error.code, details: error.details },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'The request was not valid.',
        code: 'VALIDATION_ERROR',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const message =
    error instanceof Error ? error.message : 'Something went wrong.';
  return NextResponse.json(
    { error: message, code: 'INTERNAL_ERROR' },
    { status: fallbackStatus },
  );
}

export function notFound(what = 'Not found.'): NextResponse {
  return NextResponse.json({ error: what, code: 'NOT_FOUND' }, { status: 404 });
}

export function forbidden(message = 'You do not have access to this notebook.'): NextResponse {
  return NextResponse.json({ error: message, code: 'FORBIDDEN' }, { status: 403 });
}

export function badRequest(message: string, code = 'BAD_REQUEST'): NextResponse {
  return NextResponse.json({ error: message, code }, { status: 400 });
}

/** Wrap a handler so the session always exists. */
export async function withSession<T>(
  handler: (session: AppSession) => Promise<T>,
): Promise<NextResponse> {
  const session = await getOrCreateSession();
  const result = await handler(session);
  if (result instanceof NextResponse) return result;
  return NextResponse.json(result);
}

/**
 * Resolve a notebook the caller may use, or return an error response.
 */
export async function resolveNotebook(
  notebookId: string,
  session: AppSession,
): Promise<
  | { ok: true; notebook: typeof import('@/lib/db').schema.notebooks.$inferSelect }
  | { ok: false; response: NextResponse }
> {
  const { db, schema } = await import('@/lib/db');
  const { eq } = await import('drizzle-orm');

  const [notebook] = await db
    .select()
    .from(schema.notebooks)
    .where(eq(schema.notebooks.id, notebookId))
    .limit(1);

  if (!notebook) {
    return { ok: false, response: notFound('That notebook does not exist.') };
  }

  if (!(await canAccessNotebook(notebookId, session))) {
    return { ok: false, response: forbidden() };
  }

  return { ok: true, notebook };
}

/** Parse a JSON body, returning a helpful error when it is malformed. */
export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new UpstreamError({
      code: 'BAD_REQUEST',
      message: 'The request body was not valid JSON.',
      status: 400,
      provider: 'client',
      retryable: false,
    });
  }
}

/** The absolute URL of a request, used for OAuth redirects. */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
