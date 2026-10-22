/**
 * FreeLM — document chunker.
 *
 * Rules (from the project brief):
 *   • chunks target 300-800 tokens
 *   • 50 tokens of overlap between consecutive chunks
 *   • paragraph boundaries are preserved where possible
 *   • headings stay with the text they introduce
 *   • lists and tables stay together as coherent units
 *
 * The chunker is structure-aware: it first splits the document into
 * sections using markdown-ish headings, then packs paragraphs into chunks
 * inside each section.
 */

export interface ChunkInput {
  text: string;
  /** Page number the text came from, when the extractor knows it. */
  pageNumber?: number | null;
}

export interface ChunkOutput {
  text: string;
  chunkIndex: number;
  sectionTitle: string | null;
  pageNumber: number | null;
  tokenCount: number;
  charStart: number;
  charEnd: number;
}

export interface ChunkerOptions {
  minTokens?: number;
  maxTokens?: number;
  overlapTokens?: number;
}

const DEFAULT_OPTIONS: Required<ChunkerOptions> = {
  minTokens: 300,
  maxTokens: 800,
  overlapTokens: 50,
};

/**
 * Estimate the token count of a piece of text.
 *
 * A real tokenizer would be more accurate but adds a heavy dependency; the
 * ~4-characters-per-token heuristic used here is within a few percent for
 * English prose and is plenty for chunk sizing.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * The largest paragraph the chunker will hold in memory at once.
 *
 * A single 60 MB "paragraph" (a minified file, a book with no line breaks)
 * must never be processed as one string: V8's lookbehind regex engine
 * overflows the stack on very long inputs, and the intermediate arrays are
 * enormous. Long paragraphs are therefore split into bounded pieces first.
 */
const MAX_PARAGRAPH_CHARS = 20_000;

/**
 * Split text into sentences without a lookbehind regex.
 *
 * `split(/(?<=[.!?])\s+/)` overflows the call stack on very long strings, so
 * the boundary is found with a manual scan instead.
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '.' && char !== '!' && char !== '?') continue;

    // Consume any run of terminators, then require whitespace after it.
    let end = index + 1;
    while (end < text.length && '.!?' === text[end]) end += 1;
    if (end >= text.length || !/\s/.test(text[end] ?? '')) {
      index = end - 1;
      continue;
    }

    const sentence = text.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
    while (start < text.length && /\s/.test(text[start] ?? '')) start += 1;
    index = start - 1;
  }

  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);

  return sentences;
}

/**
 * Break a long paragraph into pieces of at most `MAX_PARAGRAPH_CHARS`,
 * preferring sentence boundaries.
 */
function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length <= MAX_PARAGRAPH_CHARS) return [paragraph];

  const pieces: string[] = [];
  let current = '';

  for (const sentence of splitSentences(paragraph)) {
    if (current.length + sentence.length + 1 > MAX_PARAGRAPH_CHARS) {
      if (current) pieces.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) pieces.push(current);

  return pieces;
}

interface Section {
  title: string | null;
  paragraphs: string[];
  pageNumber: number | null;
}

/** A heading line: markdown hashes, or a short standalone line in caps. */
function detectHeading(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return null;

  const markdown = trimmed.match(/^(#{1,6})\s+(.*)$/);
  if (markdown) return (markdown[2] ?? '').trim();

  // Numbered headings like "1. Introduction" or "Chapter 3: Results".
  const numbered = trimmed.match(/^(\d+(?:\.\d+)*)[.)]?\s+([A-Z].{0,100})$/);
  if (numbered) return trimmed;

  // ALL CAPS lines shorter than 90 characters read as headings.
  if (
    trimmed.length < 90 &&
    /^[A-Z0-9][A-Z0-9 \-&:,'()/.]{2,}$/.test(trimmed) &&
    !trimmed.endsWith('.')
  ) {
    return trimmed;
  }

  return null;
}

/** Split raw text into sections, each with a heading and its paragraphs. */
function splitIntoSections(text: string, pageNumber: number | null): Section[] {
  const lines = text.split(/\r?\n/);
  const sections: Section[] = [];

  let current: Section = { title: null, paragraphs: [], pageNumber };
  let buffer: string[] = [];

  const flushParagraph = () => {
    const paragraph = buffer.join('\n').trim();
    buffer = [];
    if (paragraph) {
      // Keep every paragraph bounded so one enormous block of text cannot
      // blow up the chunker.
      for (const piece of splitLongParagraph(paragraph)) {
        current.paragraphs.push(piece);
      }
    }
  };

  const flushSection = () => {
    flushParagraph();
    if (current.paragraphs.length > 0) {
      sections.push(current);
    }
  };

  for (const line of lines) {
    const heading = detectHeading(line);
    if (heading) {
      flushSection();
      current = { title: heading, paragraphs: [], pageNumber };
      continue;
    }
    buffer.push(line);
  }
  flushSection();

  return sections;
}

/** Group paragraphs so lists and tables are not broken apart. */
function paragraphGroups(paragraphs: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];

  for (const paragraph of paragraphs) {
    const isListOrTable =
      /^\s*([-*+]\s|\d+[.)]\s|\|)/.test(paragraph) ||
      paragraph.includes('\n- ') ||
      paragraph.includes('\n1. ') ||
      paragraph.includes('\n|');

    if (current.length > 0 && isListOrTable) {
      // Keep a list/table attached to the paragraph before it.
      current.push(paragraph);
      continue;
    }
    if (current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(paragraph);
  }
  if (current.length > 0) groups.push(current);

  return groups;
}

/** Take the last N tokens of a text as the overlap for the next chunk. */
function takeOverlap(text: string, overlapTokens: number): string {
  if (overlapTokens <= 0) return '';
  const maxChars = overlapTokens * 4;
  if (text.length <= maxChars) return text;
  // Prefer to cut at a sentence boundary.
  const slice = text.slice(-maxChars);
  const boundary = slice.search(/[.!?]\s/);
  if (boundary !== -1 && boundary < slice.length * 0.5) {
    return slice.slice(boundary + 1);
  }
  const space = slice.indexOf(' ');
  return space === -1 ? slice : slice.slice(space + 1);
}

/**
 * Chunk a document.
 *
 * The result always has contiguous, non-overlapping `charStart`/`charEnd`
 * spans into the *original* text where possible, so the Sources viewer can
 * highlight the exact passage.
 */
export function chunkDocument(
  input: ChunkInput,
  options: ChunkerOptions = {},
): ChunkOutput[] {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const { text, pageNumber = null } = input;

  if (!text || !text.trim()) return [];

  const sections = splitIntoSections(text, pageNumber);
  if (sections.length === 0) {
    sections.push({ title: null, paragraphs: [text.trim()], pageNumber });
  }

  const chunks: ChunkOutput[] = [];
  let chunkIndex = 0;
  let previousTail = '';
  let cursor = 0;

  for (const section of sections) {
    const groups = paragraphGroups(section.paragraphs);

    let bufferParts: string[] = [];
    let bufferTokens = 0;

    const emit = (body: string, sectionTitle: string | null) => {
      const trimmed = body.trim();
      if (!trimmed) return;

      // Locate the chunk in the original text using a *bounded* window
      // search. A plain `indexOf` over a 60 MB document would be O(n) per
      // chunk, which is far too slow for large sources.
      const anchor = trimmed.slice(0, 64);
      const window = text.slice(cursor, cursor + 8192);
      const relative = window.indexOf(anchor);
      const start = relative === -1 ? cursor : cursor + relative;
      const end = start + trimmed.length;
      cursor = Math.max(cursor, end);

      chunks.push({
        text: trimmed,
        chunkIndex: chunkIndex++,
        sectionTitle,
        pageNumber,
        tokenCount: estimateTokens(trimmed),
        charStart: start,
        charEnd: end,
      });
    };

    for (const group of groups) {
      const groupText = group.join('\n\n');
      const groupTokens = estimateTokens(groupText);

      // A single oversized paragraph is split on sentence boundaries.
      if (groupTokens > config.maxTokens) {
        if (bufferParts.length > 0) {
          emit(bufferParts.join('\n\n'), section.title);
          bufferParts = [];
          bufferTokens = 0;
        }
        const sentences = splitSentences(groupText);
        let piece = '';
        let pieceTokens = 0;
        for (const sentence of sentences) {
          const sentenceTokens = estimateTokens(sentence);
          if (pieceTokens + sentenceTokens > config.maxTokens && piece) {
            emit(piece, section.title);
            piece = '';
            pieceTokens = 0;
          }
          piece = piece ? `${piece} ${sentence}` : sentence;
          pieceTokens += sentenceTokens;
        }
        if (piece) emit(piece, section.title);
        continue;
      }

      if (bufferTokens + groupTokens > config.maxTokens && bufferParts.length > 0) {
        const body = bufferParts.join('\n\n');
        emit(body, section.title);
        previousTail = takeOverlap(body, config.overlapTokens);
        bufferParts = previousTail ? [previousTail] : [];
        bufferTokens = previousTail ? estimateTokens(previousTail) : 0;
      }

      bufferParts.push(groupText);
      bufferTokens += groupTokens;
    }

    if (bufferParts.length > 0) {
      const body = bufferParts.join('\n\n');
      emit(body, section.title);
      previousTail = takeOverlap(body, config.overlapTokens);
    }
  }

  // Guarantee the minimum size by merging a short chunk into its neighbour.
  return mergeShortChunks(chunks, config.minTokens);
}

function mergeShortChunks(
  chunks: ChunkOutput[],
  minTokens: number,
): ChunkOutput[] {
  const merged: ChunkOutput[] = [];

  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      chunk.tokenCount < minTokens &&
      previous.tokenCount + chunk.tokenCount <= 800
    ) {
      previous.text = `${previous.text}\n\n${chunk.text}`;
      previous.tokenCount = estimateTokens(previous.text);
      previous.charEnd = chunk.charEnd;
      continue;
    }
    merged.push({ ...chunk });
  }

  return merged.map((chunk, index) => ({ ...chunk, chunkIndex: index }));
}
