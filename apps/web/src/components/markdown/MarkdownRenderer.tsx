'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import type { Root, Text } from 'mdast';

import type { Citation } from '@freelm/shared';

import { cn } from '@/components/ui/primitives';

// ---------------------------------------------------------------------------
// Remark plugin: turn [[C:chunkId]] markers into link nodes
// ---------------------------------------------------------------------------

const MARKER = /\[\[C:([A-Za-z0-9_-]{6,64})\]\]/g;
const CITE_PROTOCOL = 'freelm-cite:';

function remarkCitations() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      if (!node.value.includes('[[C:')) return;

      const parts: Array<Text | { type: 'link'; url: string; children: Text[] }> =
        [];
      let last = 0;
      let match: RegExpExecArray | null;
      MARKER.lastIndex = 0;

      while ((match = MARKER.exec(node.value)) !== null) {
        if (match.index > last) {
          parts.push({ type: 'text', value: node.value.slice(last, match.index) });
        }
        const chunkId = match[1] ?? '';
        parts.push({
          type: 'link',
          url: `${CITE_PROTOCOL}${chunkId}`,
          children: [{ type: 'text', value: chunkId }],
        });
        last = match.index + match[0].length;
      }

      if (last < node.value.length) {
        parts.push({ type: 'text', value: node.value.slice(last) });
      }

      parent.children.splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}

// ---------------------------------------------------------------------------
// Citation chip
// ---------------------------------------------------------------------------

/**
 * react-markdown strips any URL whose scheme is not http/https/mailto/etc.
 * Our citation links use a custom scheme, so the default transform is
 * replaced with one that only neutralises `javascript:` URLs.
 */
function safeUrlTransform(url: string): string {
  if (/^\s*javascript:/i.test(url)) return '';
  return url;
}

export interface CitationChipProps {
  citation: Citation | undefined;
  chunkId: string;
  index: number;
  onClick?: (chunkId: string) => void;
}

export function CitationChip({
  citation,
  chunkId,
  index,
  onClick,
}: CitationChipProps) {
  const label = citation
    ? `${citation.sourceTitle}, ${citation.chunkLabel}`
    : `Chunk ${index + 1}`;

  return (
    <button
      type="button"
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.(chunkId);
      }}
      className={cn(
        'citation-chip mx-0.5 inline-flex h-[18px] min-w-[18px] translate-y-[-1px] items-center justify-center',
        'rounded-[5px] border border-hairline bg-surface-3 px-1 align-middle',
        'font-mono text-[10.5px] leading-none text-neutral-300',
        'hover:border-accent hover:bg-accent/20 hover:text-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
      )}
    >
      {index + 1}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

export interface MarkdownRendererProps {
  content: string;
  citations?: Citation[];
  onCitationClick?: (chunkId: string) => void;
  className?: string;
}

export function MarkdownRenderer({
  content,
  citations = [],
  onCitationClick,
  className,
}: MarkdownRendererProps) {
  const citationMap = useMemo(() => {
    const map = new Map<string, Citation>();
    citations.forEach((citation) => map.set(citation.chunkId, citation));
    return map;
  }, [citations]);

  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    citations.forEach((citation, index) => {
      if (!map.has(citation.chunkId)) map.set(citation.chunkId, map.size);
    });
    return map;
  }, [citations]);

  const plugins = useMemo(() => [remarkGfm, remarkCitations], []);

  return (
    <div className={cn('markdown-body', className)}>
      <ReactMarkdown
        remarkPlugins={plugins}
        urlTransform={safeUrlTransform}
        components={{
          a: ({ href, children, ...props }) => {
            const url = href ?? '';
            if (url.startsWith(CITE_PROTOCOL)) {
              const chunkId = url.slice(CITE_PROTOCOL.length);
              const index = indexMap.get(chunkId) ?? 0;
              return (
                <CitationChip
                  citation={citationMap.get(chunkId)}
                  chunkId={chunkId}
                  index={index}
                  {...(onCitationClick ? { onClick: onCitationClick } : {})}
                />
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
