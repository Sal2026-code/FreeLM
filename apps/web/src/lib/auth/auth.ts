/**
 * FreeLM — authentication.
 *
 * FreeLM is guest-first: nobody has to sign up to use it. Google OAuth is
 * an *optional* upgrade that lets someone sign in and keep their notebooks
 * across devices.
 *
 * Auth.js (NextAuth v5) handles the OAuth handshake and issues a JWT. The
 * JWT carries a FreeLM session id, which is the row that actually owns the
 * notebooks — so the guest path and the signed-in path share one model.
 */

import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';

import { hasGoogleAuth } from '@/lib/env';
import { linkAccountToSession, getOrCreateSession } from './session';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & { id: string };
    /** The FreeLM session that owns the notebooks. */
    freelmSessionId?: string;
  }
}

/** The extra claim FreeLM stores on the Auth.js JWT. */
interface FreeLmJwt {
  freelmSessionId?: string;
  sub?: string;
}

const providers = hasGoogleAuth()
  ? [
      Google({
        clientId: process.env.FREELM_GOOGLE_CLIENT_ID,
        clientSecret: process.env.FREELM_GOOGLE_CLIENT_SECRET,
        authorization: {
          params: { scope: 'openid email profile' },
        },
      }),
    ]
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: 'jwt' },
  pages: { signIn: '/app' },
  secret: process.env.FREELM_AUTH_SECRET || 'freelm-development-secret-change-me',
  trustHost: true,
  callbacks: {
    async jwt({ token, user, account }) {
      if (user?.email && account?.provider === 'google') {
        // Link the Google account to a FreeLM session.
        const session = await getOrCreateSession();
        await linkAccountToSession(session.id, {
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        });
        const claims = token as FreeLmJwt;
        claims.freelmSessionId = session.id;
        claims.sub = session.id;
      }
      return token;
    },
    async session({ session, token }) {
      const claims = token as FreeLmJwt;
      if (claims.freelmSessionId) {
        session.freelmSessionId = claims.freelmSessionId;
        session.user.id = claims.freelmSessionId;
      }
      return session;
    },
  },
});
