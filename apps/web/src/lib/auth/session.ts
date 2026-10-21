/**
 * FreeLM — sessions.
 *
 * FreeLM is guest-first: every visitor gets a signed session cookie and can
 * create notebooks immediately, with no sign-up. When Google OAuth is
 * configured, signing in upgrades the session to a real account so notebooks
 * sync across devices.
 *
 * The session id lives in an httpOnly cookie. Nothing about the session is
 * trusted from the client beyond that opaque id.
 */

import { randomBytes } from 'node:crypto';

import { and, eq, gt } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { db, schema } from '@/lib/db';

export const SESSION_COOKIE = 'freelm_sid';
const SESSION_TTL_DAYS = 30;

export interface AppSession {
  id: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  image: string | null;
  isGuest: boolean;
}

function newSessionId(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Write the session cookie.
 *
 * `cookies().set()` is only permitted in Route Handlers and Server Actions.
 * In a Server Component it throws, so the failure is swallowed — the caller
 * simply gets a session that will not survive the request.
 */
function persistSessionCookie(sessionId: string): void {
  try {
    cookies().set({
      name: SESSION_COOKIE,
      value: sessionId,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_TTL_DAYS * 86_400,
    });
  } catch {
    /* not a Route Handler / Server Action — nothing to persist */
  }
}

/**
 * Get the current session, creating a guest session when there is none.
 */
export async function getOrCreateSession(): Promise<AppSession> {
  const cookieStore = cookies();
  const existingId = cookieStore.get(SESSION_COOKIE)?.value;

  if (existingId) {
    const [row] = await db
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.id, existingId),
          gt(schema.sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (row) {
      return {
        id: row.id,
        userId: row.userId,
        email: row.email,
        name: row.name,
        image: row.image,
        isGuest: row.userId === null,
      };
    }
  }

  const id = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await db.insert(schema.sessions).values({ id, expiresAt });
  persistSessionCookie(id);

  return { id, userId: null, email: null, name: null, image: null, isGuest: true };
}

/** Read the current session without creating one. */
export async function getSession(): Promise<AppSession | null> {
  const cookieStore = cookies();
  const id = cookieStore.get(SESSION_COOKIE)?.value;
  if (!id) return null;

  const [row] = await db
    .select()
    .from(schema.sessions)
    .where(
      and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date())),
    )
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    email: row.email,
    name: row.name,
    image: row.image,
    isGuest: row.userId === null,
  };
}

/** Upgrade a guest session to a signed-in account. */
export async function linkAccountToSession(
  sessionId: string,
  account: { email: string; name: string | null; image: string | null },
): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  const [existingUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, account.email))
    .limit(1);

  let userId = existingUser?.id;
  if (!userId) {
    const [created] = await db
      .insert(schema.users)
      .values({
        email: account.email,
        name: account.name,
        image: account.image,
      })
      .returning({ id: schema.users.id });
    userId = created?.id;
  }

  await db
    .update(schema.sessions)
    .set({
      userId: userId ?? null,
      email: account.email,
      name: account.name,
      image: account.image,
      expiresAt,
    })
    .where(eq(schema.sessions.id, sessionId));
}

/** Sign out: destroy the session and clear the cookie. */
export async function destroySession(sessionId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

/**
 * Check that the caller may read/write a notebook.
 *
 * A notebook is accessible to its owner, to the session that created it, and
 * to anyone when it has been shared publicly.
 */
export async function canAccessNotebook(
  notebookId: string,
  session: AppSession,
): Promise<boolean> {
  const [notebook] = await db
    .select({
      id: schema.notebooks.id,
      ownerUserId: schema.notebooks.ownerUserId,
      sessionId: schema.notebooks.sessionId,
      isPublic: schema.notebooks.isPublic,
    })
    .from(schema.notebooks)
    .where(eq(schema.notebooks.id, notebookId))
    .limit(1);

  if (!notebook) return false;
  if (notebook.isPublic) return true;
  if (notebook.ownerUserId && session.userId === notebook.ownerUserId) return true;
  if (notebook.sessionId && notebook.sessionId === session.id) return true;
  return false;
}

/** Resolve a shared-notebook token to a notebook id. Expired links fail. */
export async function resolveShareToken(token: string): Promise<string | null> {
  const [row] = await db
    .select({
      notebookId: schema.notebookShares.notebookId,
      expiresAt: schema.notebookShares.expiresAt,
    })
    .from(schema.notebookShares)
    .where(eq(schema.notebookShares.token, token))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  return row.notebookId;
}
