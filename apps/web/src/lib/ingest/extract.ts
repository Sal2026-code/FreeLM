/**
 * FreeLM — text extraction.
 *
 * One extractor per source type. Every extractor returns the same shape so
 * the ingestion pipeline does not need to know what it is reading.
 */

import { createRequire } from 'node:module';

export interface ExtractedDocument {
  text: string;
  pageCount: number | null;
  title: string | null;
  metadata: Record<string, unknown>;
  /** Page boundaries, so citations can carry a page number. */
  pages?: { page: number; text: string }[];
}

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Plain text / markdown
// ---------------------------------------------------------------------------

export function extractPlainText(buffer: Buffer): ExtractedDocument {
  const text = buffer.toString('utf8');
  const firstLine = text.split('\n').find((line) => line.trim().length > 0);
  return {
    text,
    pageCount: null,
    title: firstLine && firstLine.startsWith('#')
      ? firstLine.replace(/^#+\s*/, '').trim()
      : null,
    metadata: { wordCount: countWords(text) },
  };
}

/**
 * True when a buffer looks like binary rather than readable text.
 *
 * FreeLM accepts any file type, so an unsupported binary has to be reported
 * honestly instead of being decoded into mojibake.
 */
export function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8000);
  if (sample.length === 0) return false;

  let control = 0;
  for (const byte of sample) {
    // Bytes that are neither printable ASCII nor common whitespace.
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32) || byte === 127) control += 1;
  }
  return control / sample.length > 0.05;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  // pdfjs-dist's legacy build is the one that runs in Node.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buffer);

  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  const pages: { page: number; text: string }[] = [];
  let info: Record<string, unknown> = {};

  try {
    const metadata = await doc.getMetadata();
    const raw = metadata.info as Record<string, unknown> | undefined;
    if (raw) {
      info = {
        ...(typeof raw.Title === 'string' ? { title: raw.Title } : {}),
        ...(typeof raw.Author === 'string' ? { author: raw.Author } : {}),
      };
    }
  } catch {
    /* metadata is optional */
  }

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    // Rebuild the text by grouping items into visual rows.
    const rows: { y: number; items: { x: number; s: string }[] }[] = [];
    let current: { y: number; items: { x: number; s: string }[] } | null = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5] as number;
      const x = item.transform[4] as number;
      if (!current || Math.abs(current.y - y) > 3) {
        current = { y, items: [] };
        rows.push(current);
      }
      current.items.push({ x, s: item.str });
    }

    const pageText = rows
      .map((row) =>
        row.items
          .sort((a, b) => a.x - b.x)
          .map((item) => item.s)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean)
      .join('\n');

    pages.push({ page: pageNumber, text: pageText });
  }

  const text = pages.map((page) => page.text).join('\n\n');
  const title =
    (typeof info.title === 'string' && info.title) || null;

  return {
    text,
    pageCount: doc.numPages,
    title,
    metadata: { ...info, wordCount: countWords(text) },
    pages,
  };
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

export async function extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;
  return {
    text,
    pageCount: null,
    title: null,
    metadata: {
      wordCount: countWords(text),
      ...(result.messages?.length
        ? { mammothMessages: result.messages.length }
        : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// PPTX
// ---------------------------------------------------------------------------

export async function extractPptx(buffer: Buffer): Promise<ExtractedDocument> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      return na - nb;
    });

  const slides: string[] = [];
  for (const name of slideFiles) {
    const xml = await zip.file(name)?.async('string');
    if (!xml) continue;
    const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1] ?? '');
    const body = texts
      .join(' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    if (body) slides.push(body);
  }

  const text = slides.join('\n\n');
  return {
    text,
    pageCount: slides.length,
    title: null,
    metadata: { slideCount: slides.length, wordCount: countWords(text) },
  };
}

// ---------------------------------------------------------------------------
// EPUB
// ---------------------------------------------------------------------------

export async function extractEpub(buffer: Buffer): Promise<ExtractedDocument> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);

  const chapterFiles = Object.keys(zip.files)
    .filter((name) => /^OEBPS\/(Text|.*\/Text)\/.*\.x?html?$/i.test(name))
    .sort();

  const chapters: string[] = [];
  for (const name of chapterFiles) {
    const html = await zip.file(name)?.async('string');
    if (!html) continue;
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    if (body) chapters.push(body);
  }

  const text = chapters.join('\n\n');
  return {
    text,
    pageCount: chapters.length,
    title: null,
    metadata: { chapterCount: chapters.length, wordCount: countWords(text) },
  };
}

// ---------------------------------------------------------------------------
// CSV / XLSX
// ---------------------------------------------------------------------------

export async function extractSpreadsheet(
  buffer: Buffer,
  fileName: string,
): Promise<ExtractedDocument> {
  const XLSX = require('xlsx') as typeof import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sections: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet);
    sections.push(`## ${sheetName}\n\n${csv}`);
  }

  const text = sections.join('\n\n');
  return {
    text,
    pageCount: workbook.SheetNames.length,
    title: null,
    metadata: {
      sheetNames: workbook.SheetNames,
      wordCount: countWords(text),
      originalName: fileName,
    },
  };
}

// ---------------------------------------------------------------------------
// HTML / web page
// ---------------------------------------------------------------------------

export interface WebExtraction {
  document: ExtractedDocument;
  /** The canonical URL after following redirects. */
  finalUrl: string;
  siteName: string | null;
}

export async function extractWebPage(url: string): Promise<WebExtraction> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; FreeLM/0.1; +https://github.com/Sal2026-code/FreeLM)',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Could not fetch ${url} (status ${response.status}).`);
  }

  const html = await response.text();
  const finalUrl = response.url || url;

  const { JSDOM } = await import('jsdom');
  const { Readability } = await import('@mozilla/readability');
  const dom = new JSDOM(html, { url: finalUrl });
  const reader = new Readability(dom.window.document, { charThreshold: 120 });
  const article = reader.parse();

  const text = (article?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
  const title = article?.title ?? null;
  const siteName = article?.siteName ?? null;

  const excerpt = article?.excerpt ?? null;
  const byline = article?.byline ?? null;

  return {
    finalUrl,
    siteName,
    document: {
      text,
      pageCount: null,
      title,
      metadata: {
        url: finalUrl,
        wordCount: countWords(text),
        ...(excerpt ? { excerpt } : {}),
        ...(byline ? { byline } : {}),
        ...(siteName ? { siteName } : {}),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

export interface YouTubeExtraction {
  text: string;
  title: string;
  author: string | null;
  duration: number | null;
  videoId: string;
}

export function parseYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

export async function extractYouTube(url: string): Promise<YouTubeExtraction> {
  const videoId = parseYouTubeId(url);
  if (!videoId) {
    throw new Error('That does not look like a YouTube video URL.');
  }

  const { YoutubeTranscript } = await import('youtube-transcript');
  const transcript = await YoutubeTranscript.fetchTranscript(videoId);

  if (!transcript || transcript.length === 0) {
    throw new Error(
      'This video has no caption file, so it cannot be imported. Only public videos with captions are supported.',
    );
  }

  const text = transcript
    .map((entry) => entry.text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');

  let title = `YouTube video ${videoId}`;
  let author: string | null = null;
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    );
    if (response.ok) {
      const data = (await response.json()) as { title?: string; author_name?: string };
      if (data.title) title = data.title;
      if (data.author_name) author = data.author_name;
    }
  } catch {
    /* metadata is optional */
  }

  return {
    text,
    title,
    author,
    duration: null,
    videoId,
  };
}

// ---------------------------------------------------------------------------
// Image OCR
// ---------------------------------------------------------------------------

export async function extractImageOcr(buffer: Buffer): Promise<ExtractedDocument> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const result = await worker.recognize(buffer);
    const text = result.data.text.trim();
    return {
      text,
      pageCount: 1,
      title: null,
      metadata: {
        wordCount: countWords(text),
        ocrConfidence: result.data.confidence,
      },
    };
  } finally {
    await worker.terminate();
  }
}

// ---------------------------------------------------------------------------
// Audio transcription
// ---------------------------------------------------------------------------

/**
 * Transcribe an audio file.
 *
 * Uses the OpenAI-compatible `/audio/transcriptions` endpoint, which every
 * major provider and most local servers implement.
 */
export async function extractAudio(
  buffer: Buffer,
  fileName: string,
): Promise<ExtractedDocument> {
  const { env } = await import('@/lib/env');

  const baseUrl =
    env.FREELM_AI_PROVIDER === 'openai-compatible'
      ? env.FREELM_OPENAI_COMPATIBLE_BASE_URL
      : env.FREELM_OPENAI_BASE_URL;
  const apiKey =
    env.FREELM_AI_PROVIDER === 'openai-compatible'
      ? env.FREELM_OPENAI_COMPATIBLE_API_KEY
      : env.FREELM_OPENAI_API_KEY;

  if (!baseUrl) {
    throw new Error(
      'Audio import needs a transcription endpoint. Configure an OpenAI-compatible provider in .env.local.',
    );
  }

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)]), fileName);
  form.append('model', 'whisper-1');
  form.append('response_format', 'text');

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Transcription failed (status ${response.status}). ${body.slice(0, 200)}`);
  }

  const text = (await response.text()).trim();
  return {
    text,
    pageCount: null,
    title: null,
    metadata: { wordCount: countWords(text) },
  };
}
