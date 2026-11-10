/**
 * FreeLM — citation protocol.
 *
 * The model is asked to emit citations as `[[C:<chunkId>]]` inline markers.
 * The server:
 *   1. parses the markers out of the text,
 *   2. validates that every chunk id is in the retrieved set,
 *   3. strips any invalid markers,
 *   4. re-renders them as clickable chips.
 *
 * Both the web app and the mobile app use this module so a message looks
 * identical everywhere.
 */

export const CITATION_PATTERN = /\[\[C:([A-Za-z0-9_-]{6,64})\]\]/g;

export interface ParsedCitation {
  chunkId: string;
  /** Text that followed the marker, used as the supporting quote. */
  quote: string;
}

export interface CitationParseResult {
  /** Markdown with all citation markers removed. */
  text: string;
  /** Ordered, de-duplicated chunk ids that were referenced. */
  chunkIds: string[];
  citations: ParsedCitation[];
}

/**
 * Split an assistant message into clean text plus the chunk ids it cited.
 *
 * The quote is the sentence-ish fragment immediately after the marker, which
 * is what the Sources viewer highlights when the user clicks the chip.
 */
export function parseCitations(raw: string): CitationParseResult {
  const citations: ParsedCitation[] = [];
  const seen = new Set<string>();

  const text = raw.replace(CITATION_PATTERN, (_match, chunkId: string) => {
    if (!seen.has(chunkId)) {
      seen.add(chunkId);
      citations.push({ chunkId, quote: '' });
    }
    return '';
  });

  // Attach the following fragment as a quote for each citation.
  const withQuotes = citations.map((citation) => {
    const marker = `[[C:${citation.chunkId}]]`;
    const index = raw.indexOf(marker);
    if (index === -1) return citation;
    const after = raw.slice(index + marker.length);
    const quote = after
      .split(/(?<=[.!?])\s/)
      .slice(0, 2)
      .join(' ')
      .replace(CITATION_PATTERN, '')
      .trim()
      .slice(0, 280);
    return { ...citation, quote };
  });

  return {
    text: text.replace(/[ \t]{2,}/g, ' ').trim(),
    chunkIds: withQuotes.map((c) => c.chunkId),
    citations: withQuotes,
  };
}

/**
 * Build the label shown on a citation chip.
 * The user's spec requires `[Source Title, Chunk ID]`.
 */
export function formatCitationLabel(
  sourceTitle: string,
  chunkIndex: number,
  pageNumber?: number | null,
): string {
  const base = `${sourceTitle}, Chunk ${chunkIndex + 1}`;
  return pageNumber ? `${base}, p.${pageNumber}` : base;
}

/**
 * Turn a list of citations into numbered chips, preserving the order they
 * appear in the message.
 */
export function numberCitations(chunkIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  chunkIds.forEach((id, index) => {
    if (!map.has(id)) map.set(id, map.size + 1);
  });
  return map;
}

/**
 * Insert citation chips back into markdown at the right positions.
 *
 * The server stores the *clean* markdown plus a list of chunk ids in order.
 * The client needs to know where each chip goes, so the server also stores
 * the raw text with markers. To keep this simple and robust the server
 * returns `content` (clean) and `citationOrder` (chunk ids in the order the
 * markers appeared). The chip for a chunk id is rendered inline right after
 * the sentence that referenced it.
 */
export interface InlineCitation {
  chunkId: string;
  number: number;
}

export function buildInlineCitations(chunkIds: string[]): InlineCitation[] {
  return Array.from(numberCitations(chunkIds).entries()).map(
    ([chunkId, number]) => ({ chunkId, number }),
  );
}
