'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Chunk, Source } from '@freelm/shared';
import { SOURCE_STATUS_LABEL, SOURCE_TYPE_META } from '@freelm/shared';

import { Tabs, cn, IconButton, Spinner } from '@/components/ui/primitives';

export interface SourceViewerProps {
  notebookId: string;
  source: Source;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
  /** A chunk id to scroll to and highlight (set by clicking a citation). */
  highlightChunkId?: string | null;
}

interface SourceDetail extends Source {
  guide?: { summary: string; outline: { title: string; chunkId: string | null }[] } | null;
  extractedText?: string | null;
  chunks: Chunk[];
}

/**
 * The tabbed source viewer: Extracted text, Chunks and Metadata.
 *
 * Citations in the chat pane scroll to and highlight the matching chunk.
 */
export function SourceViewer({
  source,
  onBack,
  highlightChunkId,
}: SourceViewerProps) {
  const [tab, setTab] = useState<'text' | 'chunks' | 'metadata'>('text');
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/notebooks/${source.notebookId}/sources/${source.id}`,
      );
      if (response.ok) setDetail((await response.json()) as SourceDetail);
    } finally {
      setLoading(false);
    }
  }, [source.notebookId, source.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Scroll to and highlight the cited chunk.
  useEffect(() => {
    if (!highlightChunkId) return;
    setTab('chunks');
    const timer = window.setTimeout(() => {
      const element = document.getElementById(`chunk-${highlightChunkId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [highlightChunkId, detail]);

  const meta = SOURCE_TYPE_META[source.type] ?? SOURCE_TYPE_META.file;

  const filteredChunks = useMemo(() => {
    if (!detail) return [];
    if (!query.trim()) return detail.chunks;
    const needle = query.toLowerCase();
    return detail.chunks.filter(
      (chunk) =>
        chunk.text.toLowerCase().includes(needle) ||
        (chunk.sectionTitle ?? '').toLowerCase().includes(needle),
    );
  }, [detail, query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-1">
        <IconButton icon="arrow_back" label="Back to sources" onClick={onBack} />
        <span
          className="material-symbols-rounded shrink-0 text-[17px]"
          style={{ color: meta.color }}
          aria-hidden
        >
          {meta.icon}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-100"
          title={source.title}
        >
          {source.title}
        </span>
      </div>

      {source.status !== 'ready' ? (
        <div className="mx-2 mb-2 rounded-lg border border-hairline bg-surface-2 p-2.5 text-[12px] text-neutral-400">
          {source.status === 'error' ? (
            <>
              <span className="font-medium text-danger">Import failed.</span>{' '}
              {source.error ?? 'Something went wrong.'}
            </>
          ) : (
            <span className="flex items-center gap-1.5">
              <Spinner size={12} /> {SOURCE_STATUS_LABEL[source.status]}…
            </span>
          )}
        </div>
      ) : null}

      <Tabs
        className="mx-2"
        value={tab}
        onChange={(id) => setTab(id as 'text' | 'chunks' | 'metadata')}
        items={[
          { id: 'text', label: 'Text', icon: 'notes' },
          { id: 'chunks', label: 'Chunks', icon: 'segment', count: detail?.chunks.length },
          { id: 'metadata', label: 'Metadata', icon: 'info' },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 pt-2">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-neutral-500">
            <Spinner /> Loading…
          </div>
        ) : null}

        {!loading && tab === 'text' ? (
          <div className="space-y-3">
            {detail?.guide?.summary ? (
              <div className="rounded-xl border border-accent/25 bg-accent/5 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-accent">
                  <span className="material-symbols-rounded text-[15px]" aria-hidden>
                    auto_awesome
                  </span>
                  Source guide
                </p>
                <p className="text-[13px] leading-6 text-neutral-200">
                  {detail.guide.summary}
                </p>
                {detail.guide.outline.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {detail.guide.outline.map((entry, index) => (
                      <li key={`${entry.title}-${index}`}>
                        <span className="inline-block rounded-pill border border-hairline bg-surface-2 px-2 py-0.5 text-[11.5px] text-neutral-300">
                          {entry.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-6 text-neutral-300">
              {detail?.extractedText || 'No extracted text yet.'}
            </pre>
          </div>
        ) : null}

        {!loading && tab === 'chunks' ? (
          <div className="space-y-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search within this source"
              className="field h-8 py-0 text-[12.5px]"
            />
            {filteredChunks.length === 0 ? (
              <p className="py-4 text-[12.5px] text-neutral-500">
                {detail?.chunks.length
                  ? 'No chunks match your search.'
                  : 'This source has not been chunked yet.'}
              </p>
            ) : null}
            {filteredChunks.map((chunk) => (
              <article
                key={chunk.id}
                id={`chunk-${chunk.id}`}
                className={cn(
                  'rounded-xl border p-2.5 transition',
                  highlightChunkId === chunk.id
                    ? 'border-accent bg-accent/10 ring-1 ring-accent/40'
                    : 'border-hairline bg-surface-2',
                )}
              >
                <div className="mb-1 flex items-center gap-2 text-[11px] text-neutral-500">
                  <span className="font-medium text-neutral-400">
                    Chunk {chunk.chunkIndex + 1}
                  </span>
                  {chunk.sectionTitle ? (
                    <span className="truncate">· {chunk.sectionTitle}</span>
                  ) : null}
                  {chunk.pageNumber ? <span>· p.{chunk.pageNumber}</span> : null}
                  <span className="ml-auto">{chunk.tokenCount} tokens</span>
                </div>
                <p className="whitespace-pre-wrap text-[12.5px] leading-5 text-neutral-300">
                  {chunk.text}
                </p>
              </article>
            ))}
          </div>
        ) : null}

        {!loading && tab === 'metadata' ? (
          <dl className="space-y-2 text-[12.5px]">
            <Row label="Title" value={source.title} />
            <Row label="Type" value={meta.label} />
            <Row label="Status" value={SOURCE_STATUS_LABEL[source.status]} />
            <Row label="Chunks" value={String(detail?.chunks.length ?? 0)} />
            <Row
              label="Added"
              value={new Date(source.createdAt).toLocaleString()}
            />
            {typeof source.metadata.pageCount === 'number' ? (
              <Row label="Pages" value={String(source.metadata.pageCount)} />
            ) : null}
            {typeof source.metadata.wordCount === 'number' ? (
              <Row label="Words" value={String(source.metadata.wordCount)} />
            ) : null}
            {typeof source.metadata.url === 'string' ? (
              <Row label="URL" value={source.metadata.url} />
            ) : null}
            {typeof source.metadata.originalName === 'string' ? (
              <Row label="File" value={source.metadata.originalName} />
            ) : null}
            {typeof source.metadata.mimeType === 'string' ? (
              <Row label="MIME type" value={source.metadata.mimeType} />
            ) : null}
            {typeof source.metadata.author === 'string' ? (
              <Row label="Author" value={source.metadata.author} />
            ) : null}
            {typeof source.metadata.videoId === 'string' ? (
              <Row label="Video id" value={source.metadata.videoId} />
            ) : null}
            {source.error ? <Row label="Error" value={source.error} /> : null}
          </dl>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-hairline pb-2">
      <dt className="w-28 shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-neutral-200">{value}</dd>
    </div>
  );
}
