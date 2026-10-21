/**
 * FreeLM — web research providers.
 *
 * Three tiers, chosen automatically:
 *   1. Tavily    (if TAVILY_API_KEY is set) — best for LLM-shaped results
 *   2. Brave     (if BRAVE_API_KEY is set)  — fast, high quality
 *   3. DuckDuckGo (keyless fallback)        — always available
 *
 * Fast Research returns candidate sources for the user to review.
 * Deep Research additionally synthesises a report that becomes a new source.
 */

import type { ResearchCandidate, SourceType } from '@freelm/shared';

import { env } from '@/lib/env';

export interface SearchProvider {
  name: string;
  search(query: string, limit: number): Promise<ResearchCandidate[]>;
}

function guessType(url: string): SourceType {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/\.pdf($|\?)/i.test(url)) return 'pdf';
  if (/\.docx?($|\?)/i.test(url)) return 'docx';
  if (/\.pptx?($|\?)/i.test(url)) return 'pptx';
  if (/\.csv($|\?)/i.test(url)) return 'csv';
  if (/\.epub($|\?)/i.test(url)) return 'epub';
  return 'web';
}

function faviconFor(url: string): string {
  try {
    const origin = new URL(url).origin;
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(
      new URL(url).hostname,
    )}`;
  } catch {
    return originFallback(url);
  }
}

function originFallback(url: string): string {
  try {
    return `${new URL(url).origin}/favicon.ico`;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Tavily
// ---------------------------------------------------------------------------

class TavilyProvider implements SearchProvider {
  readonly name = 'tavily';

  async search(query: string, limit: number): Promise<ResearchCandidate[]> {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.FREELM_TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        max_results: Math.min(limit, 20),
        search_depth: 'basic',
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed (status ${response.status}).`);
    }

    const data = (await response.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };

    return (data.results ?? [])
      .filter((item) => item.url)
      .map((item) => ({
        title: item.title ?? item.url ?? 'Untitled',
        url: item.url as string,
        snippet: (item.content ?? '').slice(0, 400),
        relevance:
          'Selected by Tavily as highly relevant to your research question.',
        faviconUrl: faviconFor(item.url as string),
        sourceType: guessType(item.url as string),
      }));
  }
}

// ---------------------------------------------------------------------------
// Brave
// ---------------------------------------------------------------------------

class BraveProvider implements SearchProvider {
  readonly name = 'brave';

  async search(query: string, limit: number): Promise<ResearchCandidate[]> {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(limit, 20)));

    const response = await fetch(url.toString(), {
      headers: {
        'X-Subscription-Token': env.FREELM_BRAVE_API_KEY,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Brave search failed (status ${response.status}).`);
    }

    const data = (await response.json()) as {
      web?: {
        results?: {
          title?: string;
          url?: string;
          description?: string;
        }[];
      };
    };

    return (data.web?.results ?? [])
      .filter((item) => item.url)
      .map((item) => ({
        title: item.title ?? item.url ?? 'Untitled',
        url: item.url as string,
        snippet: (item.description ?? '').slice(0, 400),
        relevance: 'Selected by Brave Search as highly relevant to your query.',
        faviconUrl: faviconFor(item.url as string),
        sourceType: guessType(item.url as string),
      }));
  }
}

// ---------------------------------------------------------------------------
// DuckDuckGo (keyless)
// ---------------------------------------------------------------------------

class DuckDuckGoProvider implements SearchProvider {
  readonly name = 'duckduckgo';

  async search(query: string, limit: number): Promise<ResearchCandidate[]> {
    const url = new URL('https://html.duckduckgo.com/html/');
    url.searchParams.set('q', query);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Web search failed (status ${response.status}).`);
    }

    const html = await response.text();
    const { load } = await import('cheerio');
    const $ = load(html);

    const results: ResearchCandidate[] = [];
    $('.result__body').each((_index, element) => {
      if (results.length >= limit) return;
      const node = $(element);
      const title = node.find('.result__a').first().text().trim();
      const href = node.find('.result__a').first().attr('href') ?? '';
      const snippet = node.find('.result__snippet').first().text().trim();
      if (!title || !href) return;

      // DuckDuckGo wraps outbound links in /l/?uddg=<encoded>.
      const match = href.match(/[?&]uddg=([^&]+)/);
      const target = match?.[1] ? decodeURIComponent(match[1]) : href;

      results.push({
        title,
        url: target,
        snippet: snippet.slice(0, 400),
        relevance: 'Found by web search for your research question.',
        faviconUrl: faviconFor(target),
        sourceType: guessType(target),
      });
    });

    return results;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let cached: SearchProvider | null = null;

export function getSearchProvider(): SearchProvider {
  if (cached) return cached;
  if (env.FREELM_TAVILY_API_KEY) cached = new TavilyProvider();
  else if (env.FREELM_BRAVE_API_KEY) cached = new BraveProvider();
  else cached = new DuckDuckGoProvider();
  return cached;
}

export async function searchWeb(
  query: string,
  limit = 10,
): Promise<ResearchCandidate[]> {
  const provider = getSearchProvider();
  try {
    return await provider.search(query, limit);
  } catch (error) {
    // If the preferred provider fails, fall back to the keyless one so the
    // feature still works.
    if (provider.name !== 'duckduckgo') {
      return new DuckDuckGoProvider().search(query, limit);
    }
    throw error;
  }
}
