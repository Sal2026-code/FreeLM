'use client';

import { useCallback, useMemo, useState } from 'react';

import type { Source, StudioOutput } from '@freelm/shared';
import { STUDIO_GRID_TOOLS, STUDIO_TOOL_MAP } from '@freelm/shared';

import { StudioOutputViewer } from '@/components/studio/StudioOutputViewer';
import { StudioToolModal } from '@/components/studio/StudioToolModal';
import { Dropdown } from '@/components/ui/Dropdown';
import {
  Button,
  cn,
  IconButton,
  Spinner,
  useToast,
} from '@/components/ui/primitives';

export interface StudioPaneProps {
  notebookId: string;
  outputs: StudioOutput[];
  notes: { id: string; title: string; content: string }[];
  activeOutputId: string | null;
  onSelectOutput: (id: string | null) => void;
  onChanged: () => void | Promise<void>;
  sources: Source[];
  selectedSourceIds: string[];
  onSendToChat: (content: string) => void | Promise<void>;
}

export function StudioPane({
  notebookId,
  outputs,
  notes,
  activeOutputId,
  onSelectOutput,
  onChanged,
  sources,
  selectedSourceIds,
  onSendToChat,
}: StudioPaneProps) {
  const toast = useToast();
  const [modalTool, setModalTool] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [addingNote, setAddingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  const activeOutput = useMemo(
    () => outputs.find((output) => output.id === activeOutputId) ?? null,
    [outputs, activeOutputId],
  );

  const readySources = useMemo(
    () => sources.filter((source) => source.status === 'ready'),
    [sources],
  );

  const createNote = useCallback(async () => {
    if (!noteContent.trim()) return;
    const response = await fetch(`/api/notebooks/${notebookId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: noteTitle.trim() || 'Untitled note',
        content: noteContent,
      }),
    });
    if (response.ok) {
      setNoteTitle('');
      setNoteContent('');
      setAddingNote(false);
      toast.push({ tone: 'success', title: 'Note added' });
      await onChanged();
    }
  }, [noteTitle, noteContent, notebookId, onChanged, toast]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface/40">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h2 className="text-sm font-semibold text-neutral-100">Studio</h2>
        <IconButton
          icon="info"
          label="Studio options"
          onClick={() => undefined}
        />
      </header>

      {/* Tool grid */}
      <div className="shrink-0 px-3">
        <div className="grid grid-cols-3 gap-1.5">
          {STUDIO_GRID_TOOLS.map((type) => {
            const tool = STUDIO_TOOL_MAP[type];
            if (!tool) return null;
            const busy = generating === type;

            return (
              <button
                key={type}
                type="button"
                disabled={readySources.length === 0 || busy}
                onClick={() => setModalTool(type)}
                title={tool.description}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border border-hairline bg-surface-2 px-1.5 py-2.5',
                  'text-center transition hover:border-hairline-strong hover:bg-surface-3',
                  'disabled:cursor-not-allowed disabled:opacity-45',
                )}
              >
                {busy ? (
                  <Spinner size={16} />
                ) : (
                  <span
                    className="material-symbols-rounded text-[19px] text-neutral-300"
                    aria-hidden
                  >
                    {tool.icon}
                  </span>
                )}
                <span className="text-[11.5px] leading-tight text-neutral-300">
                  {tool.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Outputs */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-3">
        {activeOutput ? (
          <StudioOutputViewer
            output={activeOutput}
            onBack={() => onSelectOutput(null)}
            onChanged={onChanged}
            onSendToChat={onSendToChat}
          />
        ) : (
          <>
            {outputs.length === 0 && notes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
                <span className="material-symbols-rounded text-[26px] text-neutral-600">
                  edit_note
                </span>
                <p className="text-[13px] font-medium text-neutral-400">
                  Studio output will be saved here.
                </p>
                <p className="text-[12px] leading-5 text-neutral-600">
                  After adding sources, click to add Audio Overview, Study Guide,
                  Mind Map, and more.
                </p>
              </div>
            ) : null}

            {outputs.length > 0 ? (
              <ul className="space-y-1">
                {outputs.map((output) => {
                  const tool = STUDIO_TOOL_MAP[output.type];
                  const generating_ =
                    (output.meta as { status?: string })?.status === 'generating';

                  return (
                    <li key={output.id}>
                      <div className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition hover:bg-surface-2">
                        <button
                          type="button"
                          onClick={() => onSelectOutput(output.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span
                            className="material-symbols-rounded shrink-0 text-[17px] text-neutral-400"
                            aria-hidden
                          >
                            {tool?.icon ?? 'description'}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[12.5px] text-neutral-200">
                              {output.title}
                            </span>
                            <span className="block truncate text-[11px] text-neutral-500">
                              {generating_
                                ? 'Generating…'
                                : `${tool?.label ?? output.type} · ${relativeTime(
                                    output.createdAt,
                                  )}`}
                            </span>
                          </span>
                        </button>
                        <Dropdown
                          align="end"
                          label="Output options"
                          trigger={
                            <span className="icon-button h-6 w-6 opacity-0 transition group-hover:opacity-100">
                              <span className="material-symbols-rounded text-[16px]">
                                more_vert
                              </span>
                            </span>
                          }
                          items={[
                            {
                              id: 'send',
                              label: 'Send to chat',
                              icon: 'forum',
                              onSelect: () =>
                                void onSendToChat(
                                  `Summarise the Studio output "${output.title}".`,
                                ),
                            },
                            {
                              id: 'copy',
                              label: 'Copy as markdown',
                              icon: 'content_copy',
                              onSelect: async () => {
                                await navigator.clipboard.writeText(
                                  stringifyOutput(output),
                                );
                                toast.push({ tone: 'success', title: 'Copied' });
                              },
                            },
                            {
                              id: 'delete',
                              label: 'Delete',
                              icon: 'delete',
                              destructive: true,
                              onSelect: async () => {
                                await fetch(
                                  `/api/notebooks/${notebookId}/studio/outputs/${output.id}`,
                                  { method: 'DELETE' },
                                );
                                await onChanged();
                              },
                            },
                          ]}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {notes.length > 0 ? (
              <>
                <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Notes
                </p>
                <ul className="space-y-1">
                  {notes.map((note) => (
                    <li
                      key={note.id}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition hover:bg-surface-2"
                    >
                      <span
                        className="material-symbols-rounded shrink-0 text-[16px] text-neutral-500"
                        aria-hidden
                      >
                        sticky_note_2
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-neutral-300">
                        {note.title}
                      </span>
                      <Dropdown
                        align="end"
                        label="Note options"
                        trigger={
                          <span className="icon-button h-6 w-6">
                            <span className="material-symbols-rounded text-[15px]">
                              more_vert
                            </span>
                          </span>
                        }
                        items={[
                          {
                            id: 'promote',
                            label: 'Add as a source',
                            icon: 'library_add',
                            onSelect: async () => {
                              const response = await fetch(
                                `/api/notebooks/${notebookId}/notes/${note.id}/promote`,
                                { method: 'POST' },
                              );
                              if (response.ok) {
                                toast.push({
                                  tone: 'success',
                                  title: 'Note added as a source',
                                });
                                await onChanged();
                              }
                            },
                          },
                          {
                            id: 'delete',
                            label: 'Delete',
                            icon: 'delete',
                            destructive: true,
                            onSelect: async () => {
                              await fetch(
                                `/api/notebooks/${notebookId}/notes/${note.id}`,
                                { method: 'DELETE' },
                              );
                              await onChanged();
                            },
                          },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Add note */}
      <div className="shrink-0 px-3 pb-3 pt-1">
        {addingNote ? (
          <div className="space-y-2 rounded-xl border border-hairline bg-surface-2 p-2">
            <input
              autoFocus
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              placeholder="Note title"
              className="field h-8 py-0 text-[12.5px]"
            />
            <textarea
              value={noteContent}
              onChange={(event) => setNoteContent(event.target.value)}
              rows={4}
              placeholder="Write anything…"
              className="field resize-none text-[12.5px]"
            />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" onClick={() => setAddingNote(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!noteContent.trim()}
                onClick={() => void createNote()}
              >
                Save note
              </Button>
            </div>
          </div>
        ) : (
          <Button
            fullWidth
            icon="add"
            onClick={() => setAddingNote(true)}
            className="justify-center"
          >
            Add note
          </Button>
        )}
      </div>

      <StudioToolModal
        toolType={modalTool}
        notebookId={notebookId}
        sources={readySources}
        selectedSourceIds={selectedSourceIds}
        onClose={() => setModalTool(null)}
        onGenerating={(type) => setGenerating(type)}
        onGenerated={async () => {
          setModalTool(null);
          setGenerating(null);
          await onChanged();
        }}
      />
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function stringifyOutput(output: StudioOutput): string {
  if (typeof output.content === 'string') return output.content;
  return `## ${output.title}\n\n\`\`\`json\n${JSON.stringify(
    output.content,
    null,
    2,
  )}\n\`\`\``;
}
