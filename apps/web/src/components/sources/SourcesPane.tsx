'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Source } from '@freelm/shared';
import { SOURCE_STATUS_LABEL, SOURCE_TYPE_META } from '@freelm/shared';

import { AddSourcesModal } from '@/components/sources/AddSourcesModal';
import { SourceViewer } from '@/components/sources/SourceViewer';
import { Dropdown } from '@/components/ui/Dropdown';
import { cn, IconButton, Spinner, useToast } from '@/components/ui/primitives';

export interface SourcesPaneProps {
  notebookId: string;
  sources: Source[];
  selectedSourceIds: string[];
  onSelectSources: (ids: string[]) => void;
  activeSourceId: string | null;
  onSelectSource: (id: string | null) => void;
  onChanged: () => void | Promise<void>;
  onOpenChat: () => void;
  /** Collapse or expand the pane from the header button. */
  onToggleCollapse?: () => void;
  collapsed?: boolean;
}

export function SourcesPane({
  notebookId,
  sources,
  selectedSourceIds,
  onSelectSources,
  activeSourceId,
  onSelectSource,
  onChanged,
  onOpenChat,
  onToggleCollapse,
  collapsed,
}: SourcesPaneProps) {
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [highlightChunkId, setHighlightChunkId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<
    { title: string; url: string; snippet: string; sourceType?: string }[]
  >([]);
  const [showSearch, setShowSearch] = useState(false);

  // A citation clicked in the chat opens the source it came from and
  // highlights the exact chunk.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ chunkId: string; sourceId: string }>)
        .detail;
      if (!detail) return;
      if (detail.sourceId) onSelectSource(detail.sourceId);
      setHighlightChunkId(detail.chunkId);
    };
    window.addEventListener('freelm:open-source', handler);
    return () => window.removeEventListener('freelm:open-source', handler);
  }, [onSelectSource]);

  // "Upload a source" in the chat empty state opens this pane's dialog.
  useEffect(() => {
    const handler = () => setAddOpen(true);
    window.addEventListener('freelm:open-sources', handler);
    return () => window.removeEventListener('freelm:open-sources', handler);
  }, []);

  const activeSource = useMemo(
    () => sources.find((source) => source.id === activeSourceId) ?? null,
    [sources, activeSourceId],
  );

  const allSelected =
    sources.length > 0 && selectedSourceIds.length === sources.length;

  const toggleSource = useCallback(
    (id: string) => {
      onSelectSources(
        selectedSourceIds.includes(id)
          ? selectedSourceIds.filter((value) => value !== id)
          : [...selectedSourceIds, id],
      );
    },
    [selectedSourceIds, onSelectSources],
  );

  async function runWebSearch(term: string) {
    if (!term.trim()) return;
    setSearching(true);
    setShowSearch(true);
    try {
      const response = await fetch(`/api/notebooks/${notebookId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: term, mode: 'fast' }),
      });
      if (response.ok) {
        const data = (await response.json()) as {
          candidates: { title: string; url: string; snippet: string }[];
        };
        setCandidates(data.candidates);
      } else {
        const error = (await response.json()) as { error?: string };
        toast.push({
          tone: 'error',
          title: 'Search failed',
          description: error.error,
        });
      }
    } catch {
      toast.push({
        tone: 'error',
        title: 'Search failed',
        description: 'Could not reach the search provider.',
      });
    } finally {
      setSearching(false);
    }
  }

  async function addCandidate(candidate: { url: string; title: string }) {
    try {
      const response = await fetch(
        `/api/notebooks/${notebookId}/sources/web`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: candidate.url, title: candidate.title }),
        },
      );
      if (response.ok) {
        toast.push({ tone: 'success', title: 'Source added' });
        await onChanged();
        setCandidates((current) =>
          current.filter((item) => item.url !== candidate.url),
        );
      } else {
        const error = (await response.json()) as { error?: string };
        toast.push({
          tone: 'error',
          title: 'Could not add that source',
          description: error.error,
        });
      }
    } catch {
      toast.push({ tone: 'error', title: 'Could not add that source' });
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface/40">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h2 className="text-sm font-semibold text-neutral-100">Sources</h2>
        <div className="flex items-center gap-0.5">
          <IconButton
            icon="right_panel_close"
            label={collapsed ? 'Expand the sources panel' : 'Collapse the sources panel'}
            onClick={() => onToggleCollapse?.()}
          />
        </div>
      </header>

      {/* Add sources */}
      <div className="shrink-0 px-3">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-pill border border-hairline bg-surface-2 py-2 text-[13px] font-medium text-neutral-200 transition hover:border-hairline-strong hover:bg-surface-3"
        >
          <span className="material-symbols-rounded text-[18px]" aria-hidden>
            add
          </span>
          Add sources
        </button>
      </div>

      {/* Web search */}
      <div className="shrink-0 px-3 pt-2">
        <div className="rounded-xl border border-hairline bg-surface-2 p-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-rounded text-[18px] text-neutral-500">
              search
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runWebSearch(query);
              }}
              placeholder="Search the web for new sources"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-neutral-100 outline-none placeholder:text-neutral-500"
            />
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="pill h-7 px-2.5 text-[12px]">
              <span className="material-symbols-rounded text-[16px]" aria-hidden>
                language
              </span>
              Web
              <span className="material-symbols-rounded text-[14px] text-neutral-500">
                expand_more
              </span>
            </span>
            <span className="pill h-7 px-2.5 text-[12px]">
              <span className="material-symbols-rounded text-[16px]" aria-hidden>
                bolt
              </span>
              Fast Research
              <span className="material-symbols-rounded text-[14px] text-neutral-500">
                expand_more
              </span>
            </span>
            <button
              type="button"
              onClick={() => void runWebSearch(query)}
              disabled={searching}
              aria-label="Search the web"
              className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-3 text-neutral-200 transition hover:bg-neutral-700 disabled:opacity-50"
            >
              {searching ? (
                <Spinner size={13} />
              ) : (
                <span className="material-symbols-rounded text-[16px]" aria-hidden>
                  arrow_forward
                </span>
              )}
            </button>
          </div>
        </div>

        {showSearch && candidates.length > 0 ? (
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-hairline bg-surface-2">
            {candidates.map((candidate) => (
              <div
                key={candidate.url}
                className="flex items-start gap-2 border-b border-hairline px-2.5 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-neutral-100">
                    {candidate.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-4 text-neutral-500">
                    {candidate.snippet}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void addCandidate(candidate)}
                  className="icon-button h-6 w-6 shrink-0"
                  aria-label="Add this source"
                >
                  <span className="material-symbols-rounded text-[15px]">
                    add_circle
                  </span>
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Select all */}
      {sources.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between px-3 pt-3">
          <span className="text-[12.5px] text-neutral-400">Select all sources</span>
          <button
            type="button"
            onClick={() =>
              onSelectSources(
                allSelected
                  ? []
                  : sources
                      .filter((source) => source.status === 'ready')
                      .map((source) => source.id),
              )
            }
            aria-label="Select all sources"
            className={cn(
              'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition',
              allSelected
                ? 'border-accent bg-accent text-white'
                : 'border-hairline-strong bg-surface-2 hover:border-neutral-500',
            )}
          >
            {allSelected ? (
              <span className="material-symbols-rounded text-[14px]" aria-hidden>
                check
              </span>
            ) : null}
          </button>
        </div>
      ) : null}

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-1.5">
        {activeSource ? (
          <SourceViewer
            notebookId={notebookId}
            source={activeSource}
            highlightChunkId={highlightChunkId}
            onBack={() => {
              onSelectSource(null);
              setHighlightChunkId(null);
            }}
            onChanged={() => void onChanged()}
          />
        ) : sources.length === 0 ? (
          <div className="anim-fade-in flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="anim-float material-symbols-rounded text-[26px] text-neutral-600">
              description
            </span>
            <p className="text-[13px] font-medium text-neutral-400">
              Saved sources will appear here
            </p>
            <p className="text-[12px] leading-5 text-neutral-600">
              Click Add sources to add PDFs, websites, new articles, or audio
              files. Or import a file directly from Google Drive.
            </p>
            <p className="flex items-center gap-1 text-[11.5px] text-success">
              <span className="material-symbols-rounded text-[14px]">
                all_inclusive
              </span>
              Unlimited sources — no count, size or length limit
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {sources.map((source) => {
              const meta = SOURCE_TYPE_META[source.type] ?? SOURCE_TYPE_META.file;
              const selected = selectedSourceIds.includes(source.id);
              const busy = source.status !== 'ready' && source.status !== 'error';

              return (
                <li key={source.id}>
                  <div
                    className={cn(
                      'group relative flex items-center gap-2 rounded-lg px-2 py-1.5',
                      'transition-colors duration-[--duration-short] hover:bg-surface-2',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectSource(source.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className="material-symbols-rounded shrink-0 text-[17px]"
                        style={{ color: meta.color }}
                        aria-hidden
                      >
                        {meta.icon}
                      </span>
                      <span
                        className={cn(
                          'truncate text-[13px]',
                          source.status === 'error'
                            ? 'text-danger'
                            : 'text-neutral-200',
                        )}
                        title={source.title}
                      >
                        {source.title}
                      </span>
                    </button>

                    {busy ? (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-neutral-500">
                        <Spinner size={11} />
                        {SOURCE_STATUS_LABEL[source.status]}
                      </span>
                    ) : null}

                    {/* A travelling bar shows that ingestion is still running. */}
                    {busy ? (
                      <span className="progress-track absolute inset-x-0 bottom-0">
                        <span className="progress-indeterminate absolute inset-0" />
                      </span>
                    ) : null}

                    {source.status === 'error' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const response = await fetch(
                            `/api/notebooks/${notebookId}/sources/${source.id}/retry`,
                            { method: 'POST' },
                          );
                          if (response.ok) await onChanged();
                        }}
                        className="shrink-0 text-[11px] font-medium text-accent hover:text-accent-hover"
                      >
                        Retry
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => toggleSource(source.id)}
                      aria-label={`${selected ? 'Deselect' : 'Select'} ${source.title}`}
                      className={cn(
                        'flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border transition',
                        selected
                          ? 'border-accent bg-accent text-white'
                          : 'border-hairline-strong bg-surface-2 hover:border-neutral-500',
                      )}
                    >
                      {selected ? (
                        <span className="material-symbols-rounded text-[12px]" aria-hidden>
                          check
                        </span>
                      ) : null}
                    </button>

                    <SourceMenu
                      notebookId={notebookId}
                      source={source}
                      onChanged={onChanged}
                      onOpenChat={onOpenChat}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AddSourcesModal
        open={addOpen}
        notebookId={notebookId}
        onClose={() => setAddOpen(false)}
        onAdded={async () => {
          await onChanged();
        }}
      />
    </div>
  );
}

function SourceMenu({
  notebookId,
  source,
  onChanged,
  onOpenChat,
}: {
  notebookId: string;
  source: Source;
  onChanged: () => void | Promise<void>;
  onOpenChat: () => void;
}) {
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(source.title);

  useEffect(() => {
    setTitle(source.title);
  }, [source.title]);

  async function rename() {
    setRenaming(false);
    if (!title.trim() || title.trim() === source.title) return;
    const response = await fetch(
      `/api/notebooks/${notebookId}/sources/${source.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      },
    );
    if (response.ok) await onChanged();
  }

  async function remove() {
    const response = await fetch(
      `/api/notebooks/${notebookId}/sources/${source.id}`,
      { method: 'DELETE' },
    );
    if (response.ok) {
      toast.push({ tone: 'success', title: 'Source removed' });
      await onChanged();
    }
  }

  return (
    <Dropdown
      align="end"
      label="Source options"
      trigger={
        <span className="icon-button h-6 w-6 opacity-0 transition group-hover:opacity-100">
          <span className="material-symbols-rounded text-[16px]" aria-hidden>
            more_vert
          </span>
        </span>
      }
      items={[
        {
          id: 'rename',
          label: 'Rename source',
          icon: 'edit',
          onSelect: () => setRenaming(true),
        },
        {
          id: 'remove',
          label: 'Remove source',
          icon: 'delete',
          destructive: true,
          onSelect: () => void remove(),
        },
        {
          id: 'ask',
          label: 'Ask about this source',
          icon: 'chat',
          separatorBefore: true,
          onSelect: () => {
            onOpenChat();
            window.dispatchEvent(
              new CustomEvent('freelm:send-message', {
                detail: `Summarise "${source.title}" and list its key points.`,
              }),
            );
          },
        },
      ]}
    />
  );
}
