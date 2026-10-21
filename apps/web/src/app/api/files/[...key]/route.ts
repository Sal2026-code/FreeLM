/**
 * FreeLM — file delivery.
 *
 * GET /api/files/<key>
 *
 * Serves generated artifacts (.mp3, .mp4, .png, .pdf) and uploaded source
 * files from the configured storage driver.
 */

import { NextResponse } from 'next/server';

import { getOrCreateSession } from '@/lib/auth/session';
import { jsonError, notFound } from '@/lib/api/helpers';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface RouteContext {
  params: { key: string[] };
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    await getOrCreateSession();

    const key = (context.params.key ?? []).join('/');
    if (!key) return notFound('No file requested.');

    const storage = getStorage();
    if (!(await storage.exists(key))) {
      return notFound('That file does not exist.');
    }

    const buffer = await storage.get(key);
    const contentType = guessMime(key);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'private, max-age=3600',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

function guessMime(key: string): string {
  const extension = key.slice(key.lastIndexOf('.')).toLowerCase();
  switch (extension) {
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.m4a':
      return 'audio/mp4';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.pdf':
      return 'application/pdf';
    case '.pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case '.csv':
      return 'text/csv; charset=utf-8';
    case '.json':
      return 'application/json';
    case '.txt':
    case '.md':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
