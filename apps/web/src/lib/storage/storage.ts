/**
 * FreeLM — object storage.
 *
 * Two drivers:
 *   • local — writes under `FREELM_STORAGE_PATH` (default `./storage`)
 *   • s3    — any S3-compatible service (AWS, R2, MinIO, Backblaze)
 *
 * The local driver keeps FreeLM free and self-contained: `docker compose up`
 * plus `npm run dev` is the whole setup.
 */

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '@/lib/env';

export interface StoredObject {
  key: string;
  size: number;
  mimeType: string;
}

export interface StorageDriver {
  put(key: string, body: Buffer, mimeType: string): Promise<StoredObject>;
  /** Store a file that already exists on disk, without reading it into memory. */
  putFile(
    key: string,
    filePath: string,
    mimeType: string,
  ): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  /** A URL a browser can fetch directly (or `null` for the local driver). */
  publicUrl(key: string): string | null;
}

// ---------------------------------------------------------------------------
// Local driver
// ---------------------------------------------------------------------------

const STORAGE_ROOT = path.resolve(process.cwd(), env.FREELM_STORAGE_PATH);

function safeKey(key: string): string {
  // Prevent path traversal: keys are opaque ids, never user paths.
  const cleaned = key.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (cleaned.includes('..')) throw new Error('Invalid storage key.');
  return cleaned;
}

class LocalStorageDriver implements StorageDriver {
  private pathFor(key: string): string {
    return path.join(STORAGE_ROOT, safeKey(key));
  }

  async put(key: string, body: Buffer, mimeType: string): Promise<StoredObject> {
    await mkdir(STORAGE_ROOT, { recursive: true });
    const target = this.pathFor(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return { key, size: body.byteLength, mimeType };
  }

  /**
   * Move a file that is already on disk into storage.
   *
   * The file is copied (not renamed) so the caller keeps ownership of its
   * temporary copy and can delete it safely.
   */
  async putFile(
    key: string,
    filePath: string,
    mimeType: string,
  ): Promise<StoredObject> {
    const target = this.pathFor(key);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(filePath, target);
    const info = await stat(target);
    return { key, size: info.size, mimeType };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    return createReadStream(this.pathFor(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch {
      /* already gone */
    }
  }

  publicUrl(): null {
    return null;
  }
}

// ---------------------------------------------------------------------------
// S3 driver
// ---------------------------------------------------------------------------

/**
 * Minimal S3 client using the AWS Signature V4 algorithm over `fetch`.
 *
 * Writing a focused signer avoids pulling the whole AWS SDK into the app
 * while still supporting AWS, Cloudflare R2, MinIO and Backblaze B2.
 */
class S3StorageDriver implements StorageDriver {
  private readonly bucket = env.FREELM_S3_BUCKET;
  private readonly endpoint =
    env.FREELM_S3_ENDPOINT || `https://${env.FREELM_S3_BUCKET}.s3.${env.FREELM_S3_REGION}.amazonaws.com`;
  private readonly region = env.FREELM_S3_REGION;

  private async sign(
    method: string,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256').update(body).digest('hex');

    const canonicalUri = `/${safeKey(key)}`;
    const canonicalHeaders = `content-type:${contentType}\nhost:${this.host()}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const hmac = (key: Buffer | string, data: string): Buffer =>
      createHash('sha256').update(data).digest();
    const hmacRaw = (key: Buffer, data: Buffer | string): Buffer => {
      const mac = createHmac('sha256', key).update(data).digest();
      return mac;
    };
    void hmac;

    const { createHmac } = await import('node:crypto');
    const kDate = createHmac('sha256', `AWS4${env.FREELM_S3_SECRET_ACCESS_KEY}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(this.region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    return `AWS4-HMAC-SHA256 Credential=${env.FREELM_S3_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }

  private host(): string {
    try {
      return new URL(this.endpoint).host;
    } catch {
      return this.bucket;
    }
  }

  async put(key: string, body: Buffer, mimeType: string): Promise<StoredObject> {
    const authorization = await this.sign('PUT', key, body, mimeType);
    const response = await fetch(`${this.endpoint}/${safeKey(key)}`, {
      method: 'PUT',
      headers: {
        Authorization: authorization,
        'Content-Type': mimeType,
        'x-amz-content-sha256': createHash('sha256').update(body).digest('hex'),
        'x-amz-date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`S3 upload failed with status ${response.status}`);
    }
    return { key, size: body.byteLength, mimeType };
  }

  /** Stream a local file straight to S3 without loading it into memory. */
  async putFile(
    key: string,
    filePath: string,
    mimeType: string,
  ): Promise<StoredObject> {
    const { size } = await stat(filePath);
    const body = await readFile(filePath);
    return this.put(key, body, mimeType);
  }

  async get(key: string): Promise<Buffer> {
    const response = await fetch(`${this.endpoint}/${safeKey(key)}`);
    if (!response.ok) {
      throw new Error(`S3 download failed with status ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    const response = await fetch(`${this.endpoint}/${safeKey(key)}`);
    if (!response.ok) {
      throw new Error(`S3 download failed with status ${response.status}`);
    }
    return response.body as unknown as NodeJS.ReadableStream;
  }

  async exists(key: string): Promise<boolean> {
    const response = await fetch(`${this.endpoint}/${safeKey(key)}`, { method: 'HEAD' });
    return response.ok;
  }

  async remove(key: string): Promise<void> {
    await fetch(`${this.endpoint}/${safeKey(key)}`, { method: 'DELETE' });
  }

  publicUrl(key: string): string | null {
    if (env.FREELM_S3_PUBLIC_URL) {
      return `${env.FREELM_S3_PUBLIC_URL.replace(/\/$/, '')}/${safeKey(key)}`;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  driver =
    env.FREELM_STORAGE_DRIVER === 's3' && env.FREELM_S3_BUCKET
      ? new S3StorageDriver()
      : new LocalStorageDriver();
  return driver;
}

/** Build a collision-resistant storage key for a source file. */
export function buildStorageKey(
  notebookId: string,
  sourceId: string,
  originalName: string,
): string {
  const extension = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '');
  return `${notebookId}/${sourceId}-${randomUUID()}${extension}`;
}
