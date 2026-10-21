/**
 * FreeLM — session.
 *
 * GET /api/session   who am I?
 */

import { NextResponse } from 'next/server';

import { getOrCreateSession } from '@/lib/auth/session';
import { hasAiProvider, hasGoogleAuth } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const session = await getOrCreateSession();

  return NextResponse.json({
    id: session.id,
    userId: session.userId,
    email: session.email,
    name: session.name,
    image: session.image,
    isGuest: session.isGuest,
    capabilities: {
      aiProvider: hasAiProvider(),
      googleAuth: hasGoogleAuth(),
    },
  });
}
