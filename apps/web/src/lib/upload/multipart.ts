/**
 * FreeLM — streaming multipart parser.
 *
 * `request.formData()` buffers the whole upload in memory, which makes a
 * large file impossible — a 1 TB limit is meaningless if the server has to
 * hold the file in RAM.
 *
 * This module streams the request body to a temporary file and then splits it
 * into parts *on disk*, so memory use stays flat no matter how big the
 * upload is. File parts are written straight to their own temporary file and
 * small text fields are collected in memory.
 *
 * It implements the subset of RFC 7578 that a browser form uses:
 *   - `Content-Disposition` with a `name` and an optional `filename`
 *   - `Content-Type` per part
 *   - binary-safe bodies
 */

import { mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface UploadedFile {
  /** The form field name. */
  field: string;
  /** The original filename, as sent by the client. */
  filename: string;
  /** The MIME type, as sent by the client. */
  contentType: string;
  /** Where the bytes were written. */
  path: string;
  /** Size in bytes. */
  size: number;
}

export interface MultipartResult {
  files: UploadedFile[];
  fields: Record<string, string>;
  /** Remove every temporary file this parse created. */
  cleanup: () => Promise<void>;
}

/** Extract the boundary token from a `Content-Type` header. */
export function parseBoundary(contentType: string | null): string | null {
  if (!contentType) return null;
  if (!contentType.toLowerCase().includes('multipart/form-data')) return null;

  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = match?.[1] ?? match?.[2];
  return boundary ? boundary.trim() : null;
}

const CHUNK_SIZE = 1024 * 1024;

/**
 * Stream a request body to a temporary file without buffering it in memory.
 */
export async function streamToTempFile(
  body: ReadableStream<Uint8Array>,
  tempDir: string,
): Promise<{ path: string; size: number }> {
  const target = path.join(tempDir, `upload-${randomToken()}.bin`);
  const output = await open(target, 'w');
  let size = 0;

  try {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      await output.write(value);
      size += value.byteLength;
    }
  } finally {
    await output.close();
  }

  return { path: target, size };
}

/**
 * Split a multipart body file into its parts.
 */
export class MultipartParser {
  private readonly rawPath: string;
  private readonly boundary: string;
  private readonly tempDir: string;
  private readonly maxFileBytes: number | undefined;
  private readonly tempPaths: string[];

  constructor(options: {
    rawPath: string;
    boundary: string;
    tempDir: string;
    maxFileBytes?: number;
  }) {
    this.rawPath = options.rawPath;
    this.boundary = options.boundary;
    this.tempDir = options.tempDir;
    this.maxFileBytes = options.maxFileBytes;
    this.tempPaths = [options.rawPath];
  }

  async parse(): Promise<MultipartResult> {
    const files: UploadedFile[] = [];
    const fields: Record<string, string> = {};

    const delimiter = Buffer.from(`\r\n--${this.boundary}`);
    const firstDelimiter = Buffer.from(`--${this.boundary}`);

    const handle = await open(this.rawPath, 'r');
    const total = (await handle.stat()).size;

    try {
      let position = 0;
      let buffer = Buffer.alloc(0);

      const readMore = async (): Promise<boolean> => {
        if (position >= total) return false;
        const length = Math.min(CHUNK_SIZE, total - position);
        const chunk = Buffer.alloc(length);
        await handle.read(chunk, 0, length, position);
        position += length;
        buffer = Buffer.concat([buffer, chunk]);
        return true;
      };

      const indexOfDelimiter = (): number => buffer.indexOf(delimiter);

      // --- Locate the first boundary --------------------------------------
      let start = buffer.indexOf(firstDelimiter);
      while (start === -1) {
        if (!(await readMore())) {
          return this.result(files, fields);
        }
        start = buffer.indexOf(firstDelimiter);
      }
      buffer = buffer.subarray(start + firstDelimiter.length);

      // --- Walk the parts --------------------------------------------------
      for (;;) {
        // Skip the CRLF that ends the boundary line.
        let lineEnd = buffer.indexOf('\r\n');
        while (lineEnd === -1) {
          if (!(await readMore())) return this.result(files, fields);
          lineEnd = buffer.indexOf('\r\n');
        }
        buffer = buffer.subarray(lineEnd + 2);

        // A final boundary is "--" on its own line.
        if (buffer.length >= 2 && buffer[0] === 0x2d && buffer[1] === 0x2d) {
          break;
        }

        // --- Headers --------------------------------------------------------
        let headerEnd = buffer.indexOf('\r\n\r\n');
        while (headerEnd === -1) {
          if (!(await readMore())) return this.result(files, fields);
          headerEnd = buffer.indexOf('\r\n\r\n');
        }
        const headerText = buffer.subarray(0, headerEnd).toString('utf8');
        buffer = buffer.subarray(headerEnd + 4);

        const disposition =
          /content-disposition:\s*form-data;([^\r\n]*)/i.exec(headerText)?.[1] ??
          '';
        const name = /name="([^"]*)"/i.exec(disposition)?.[1] ?? '';
        const rawFilename =
          /filename\*?=(?:UTF-8'')?"?([^";]*)"?/i.exec(disposition)?.[1];
        const contentType =
          /content-type:\s*([^\r\n;]+)/i.exec(headerText)?.[1]?.trim() ??
          'application/octet-stream';

        const isFile = rawFilename !== undefined;
        const filePath = isFile
          ? path.join(
              this.tempDir,
              `part-${randomToken()}-${safeName(rawFilename)}`,
            )
          : null;

        // --- Body -----------------------------------------------------------
        // A file part is spooled to disk as it arrives; a field part is held
        // in memory (they are small by definition).
        let written = 0;
        const writeChunk = async (chunk: Buffer): Promise<void> => {
          if (chunk.byteLength === 0) return;
          if (filePath) {
            await writeFile(filePath, chunk, { flag: 'a' });
            written += chunk.byteLength;
          } else {
            written += chunk.byteLength;
          }
        };

        let boundaryIndex = indexOfDelimiter();
        while (boundaryIndex === -1) {
          // Keep a tail the length of the delimiter so a boundary that
          // straddles a chunk boundary is still found.
          const keep = delimiter.length;
          if (buffer.length > keep) {
            const flush = buffer.subarray(0, buffer.length - keep);
            await writeChunk(flush);
            buffer = buffer.subarray(buffer.length - keep);
          }
          if (!(await readMore())) break;
          boundaryIndex = indexOfDelimiter();
        }

        const bodyEnd = boundaryIndex === -1 ? buffer.length : boundaryIndex;
        await writeChunk(buffer.subarray(0, bodyEnd));

        if (filePath) {
          this.tempPaths.push(filePath);
          const size = (await stat(filePath)).size;
          if (this.maxFileBytes !== undefined && size > this.maxFileBytes) {
            throw new Error(
              `"${decodeFilename(rawFilename ?? 'file')}" is larger than the ` +
                `${formatBytes(this.maxFileBytes)} limit set on this server.`,
            );
          }
          files.push({
            field: name,
            filename: decodeFilename(rawFilename ?? 'file'),
            contentType,
            path: filePath,
            size,
          });
        } else if (bodyEnd > 0) {
          fields[name] = buffer.subarray(0, bodyEnd).toString('utf8');
        }

        // Continue after the delimiter.
        buffer = buffer.subarray(bodyEnd + delimiter.length);
        if (buffer.length === 0 && !(await readMore())) break;
      }

      return this.result(files, fields);
    } finally {
      await handle.close();
    }
  }

  private result(
    files: UploadedFile[],
    fields: Record<string, string>,
  ): MultipartResult {
    return {
      files,
      fields,
      cleanup: async () => {
        await Promise.all(
          this.tempPaths.map((file) =>
            rm(file, { force: true, recursive: true }),
          ),
        );
      },
    };
  }
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** Create a scratch directory for one upload. */
export async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'freelm-upload-'));
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

function decodeFilename(name: string): string {
  try {
    return decodeURIComponent(escape(name));
  } catch {
    return name;
  }
}

function randomToken(): string {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export { readFile };
