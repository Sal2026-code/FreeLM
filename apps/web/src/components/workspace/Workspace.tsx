'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  Message,
  Notebook,
  NotebookOverview,
  Source,
  StudioOutput,
  Thread,
} from '@freelm/shared';

import { ChatPane } from '@/components/chat/ChatPane';
import { SourcesPane } from '@/components/sources/SourcesPane';
import { StudioPane } from '@/components/studio/StudioPane';
import { TopNav } from '@/components/shell/TopNav';
import { EmojiIconPicker } from '@/components/ui/EmojiIconPicker';
import { Spinner, useToast } from '@/components/ui/primitives';
import { useResizablePanes } from '@/hooks/useResizablePanes';

export interface WorkspaceProps {
  notebookId: string;
}

/**
 * The three-pane notebook workspace.
 *
 * Sources (left) | Chat (centre) | Studio (right), separated by two
 * draggable splitters whose widths persist between visits.
 */
export function Workspace({ notebookId }: WorkspaceProps) {
  const toast = useToast();

  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [outputs, setOutputs] = useState<StudioOutput[]>([]);
  const [notes, setNotes] = useState<
    { id: string; title: string; content: string }[]
  >([]);
  const [overview, setOverview] = useState<NotebookOverview | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeOutputId, setActiveOutputId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [mobilePane, setMobilePane] = useState<'sources' | 'chat' | 'studio'>(
    'chat',
  );

  const {
    widths,
    containerRef,
    startDragging,
    reset,
    update,
  } = useResizablePanes();

  // ---------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------

  const loadNotebook = useCallback(async () => {
    const response = await fetch(`/api/notebooks/${notebookId}`);
    if (response.ok) setNotebook((await response.json()) as Notebook);
  }, [notebookId]);

  const loadSources = useCallback(async () => {
    const response = await fetch(`/api/notebooks/${notebookId}/sources`);
    if (response.ok) {
      const list = (await response.json()) as Source[];
      setSources(list);
      // Default to all sources selected, matching the reference behaviour.
      setSelectedSourceIds((current) => {
        const ready = list.filter((s) => s.status === 'ready').map((s) => s.id);
        if (current.length === 0) return ready;
        const valid = current.filter((id) => ready.includes(id));
        return valid.length > 0 ? valid : ready;
      });
    }
  }, [notebookId]);

  const loadThreads = useCallback(async () => {
    const response = await fetch(`/api/notebooks/${notebookId}/threads`);
    if (response.ok) {
      const list = (await response.json()) as Thread[];
      setThreads(list);
      setActiveThreadId((current) => {
        if (current && list.some((thread) => thread.id === current)) return current;
        return list[0]?.id ?? null;
      });
    }
  }, [notebookId]);

  const loadMessages = useCallback(async (threadId: string) => {
    const response = await fetch(
      `/api/notebooks/${notebookId}/threads/${threadId}/messages`,
    );
    if (response.ok) setMessages((await response.json()) as Message[]);
  }, [notebookId]);

  const loadOutputs = useCallback(async () => {
    const response = await fetch(`/api/notebooks/${notebookId}/studio/outputs`);
    if (response.ok) setOutputs((await response.json()) as StudioOutput[]);
  }, [notebookId]);

  const loadNotes = useCallback(async () => {
    const response = await fetch(`/api/notebooks/${notebookId}/notes`);
    if (response.ok) {
      setNotes(
        (await response.json()) as { id: string; title: string; content: string }[],
      );
    }
  }, [notebookId]);

  const loadOverview = useCallback(async () => {
    const response = await fetch(`/api/notebooks/${notebookId}/overview`);
    if (response.ok) {
      const data = (await response.json()) as NotebookOverview | null;
      setOverview(data);
    }
  }, [notebookId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([
        loadNotebook(),
        loadSources(),
        loadThreads(),
        loadOutputs(),
        loadNotes(),
        loadOverview(),
      ]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    loadNotebook,
    loadSources,
    loadThreads,
    loadOutputs,
    loadNotes,
    loadOverview,
  ]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  // ---------------------------------------------------------------------
  // Live events
  // ---------------------------------------------------------------------

  useEffect(() => {
    const source = new EventSource(
      `/api/notebooks/${notebookId}/events`,
    );

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type: string;
          source?: Source;
          sourceId?: string;
          output?: StudioOutput;
          outputId?: string;
          overview?: NotebookOverview;
        };

        if (payload.type === 'source' && payload.source) {
          setSources((current) => {
            const index = current.findIndex(
              (item) => item.id === payload.source!.id,
            );
            if (index === -1) return [...current, payload.source!];
            const next = [...current];
            next[index] = payload.source!;
            return next;
          });
          if (payload.source.status === 'ready') {
            setSelectedSourceIds((current) =>
              current.includes(payload.source!.id)
                ? current
                : [...current, payload.source!.id],
            );
            // The first ready source triggers the pinned overview.
            void loadOverview();
          }
        }

        if (payload.type === 'source_removed' && payload.sourceId) {
          setSources((current) =>
            current.filter((item) => item.id !== payload.sourceId),
          );
          setSelectedSourceIds((current) =>
            current.filter((id) => id !== payload.sourceId),
          );
        }

        if (payload.type === 'output' && payload.output) {
          setOutputs((current) => {
            const index = current.findIndex(
              (item) => item.id === payload.output!.id,
            );
            if (index === -1) return [payload.output!, ...current];
            const next = [...current];
            next[index] = payload.output!;
            return next;
          });
        }

        if (payload.type === 'output_removed' && payload.outputId) {
          setOutputs((current) =>
            current.filter((item) => item.id !== payload.outputId),
          );
        }

        if (payload.type === 'overview' && payload.overview) {
          setOverview(payload.overview);
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    source.onerror = () => {
      /* EventSource retries automatically */
    };

    return () => source.close();
  }, [notebookId, loadOverview]);

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadSources(),
      loadThreads(),
      loadOutputs(),
      loadNotes(),
      loadOverview(),
    ]);
  }, [loadSources, loadThreads, loadOutputs, loadNotes, loadOverview]);

  const handleCreateThread = useCallback(async () => {
    const response = await fetch(`/api/notebooks/${notebookId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (response.ok) {
      const thread = (await response.json()) as Thread;
      setThreads((current) => [thread, ...current]);
      setActiveThreadId(thread.id);
    }
  }, [notebookId]);

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      const response = await fetch(
        `/api/notebooks/${notebookId}/threads/${threadId}`,
        { method: 'DELETE' },
      );
      if (response.ok) {
        setThreads((current) => current.filter((item) => item.id !== threadId));
        if (activeThreadId === threadId) {
          const next = threads.find((item) => item.id !== threadId);
          setActiveThreadId(next?.id ?? null);
        }
      }
    },
    [notebookId, activeThreadId, threads],
  );

  const handleRenameThread = useCallback(
    async (threadId: string, title: string) => {
      const response = await fetch(
        `/api/notebooks/${notebookId}/threads/${threadId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        },
      );
      if (response.ok) {
        const thread = (await response.json()) as Thread;
        setThreads((current) =>
          current.map((item) => (item.id === threadId ? thread : item)),
        );
      }
    },
    [notebookId],
  );

  const readyCount = useMemo(
    () => sources.filter((source) => source.status === 'ready').length,
    [sources],
  );

  /** Change the notebook icon from the device emoji picker. */
  const changeIcon = useCallback(
    async (icon: string) => {
      const response = await fetch(`/api/notebooks/${notebookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icon }),
      });
      if (response.ok) {
        setNotebook((current) => (current ? { ...current, icon } : current));
      } else {
        toast.push({ tone: 'error', title: 'Could not change the icon' });
      }
    },
    [notebookId, toast],
  );

  const chatPane = (
    <ChatPane
      notebook={notebook}
      notebookId={notebookId}
      threads={threads}
      activeThreadId={activeThreadId}
      onSelectThread={setActiveThreadId}
      onCreateThread={() => void handleCreateThread()}
      onDeleteThread={(id) => void handleDeleteThread(id)}
      onRenameThread={(id, title) => void handleRenameThread(id, title)}
      messages={messages}
      setMessages={setMessages}
      overview={overview}
      onRefreshOverview={() => void loadOverview()}
      sources={sources}
      selectedSourceIds={selectedSourceIds}
      onSelectSources={setSelectedSourceIds}
      onSendToChat={async (content) => {
        if (!activeThreadId) {
          await handleCreateThread();
          return;
        }
        setMobilePane('chat');
        setPendingChat((current) => [...current, content]);
      }}
      onSavedToNote={() => void loadNotes()}
    />
  );

  const sourcesPane = (
    <SourcesPane
      notebookId={notebookId}
      sources={sources}
      selectedSourceIds={selectedSourceIds}
      onSelectSources={setSelectedSourceIds}
      activeSourceId={activeSourceId}
      onSelectSource={setActiveSourceId}
      onChanged={() => void loadSources()}
      onOpenChat={() => setMobilePane('chat')}
    />
  );

  const studioPane = (
    <StudioPane
      notebookId={notebookId}
      outputs={outputs}
      notes={notes}
      activeOutputId={activeOutputId}
      onSelectOutput={setActiveOutputId}
      onChanged={() => void refreshAll()}
      sources={sources}
      selectedSourceIds={selectedSourceIds}
      onSendToChat={async (content) => {
        if (!activeThreadId) {
          await handleCreateThread();
          return;
        }
        setMobilePane('chat');
        setPendingChat((current) => [...current, content]);
      }}
    />
  );

  const [pendingChat, setPendingChat] = useState<string[]>([]);
  const pendingSent = useRef(false);

  useEffect(() => {
    if (pendingChat.length === 0 || pendingSent.current) return;
    pendingSent.current = true;
    const next = pendingChat[0]!;
    setPendingChat((current) => current.slice(1));
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('freelm:send-message', { detail: next }),
      );
      pendingSent.current = false;
    }, 120);
  }, [pendingChat]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-sm text-neutral-500">
        <Spinner /> Opening notebook…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <TopNav
        notebookTitle={notebook?.title}
        notebookIcon={notebook?.icon}
        onEditIcon={() => setPickingIcon(true)}
        right={
          <button
            type="button"
            onClick={() => void handleCreateThread()}
            className="pill hidden sm:inline-flex"
          >
            <span className="material-symbols-rounded text-[18px]" aria-hidden>
              add_comment
            </span>
            New chat
          </button>
        }
      />

      {/* Mobile pane switcher */}
      <div className="flex shrink-0 gap-1 border-b border-hairline px-3 py-2 lg:hidden">
        {(['sources', 'chat', 'studio'] as const).map((pane) => (
          <button
            key={pane}
            type="button"
            onClick={() => setMobilePane(pane)}
            className={
              mobilePane === pane
                ? 'rounded-pill bg-surface-3 px-3.5 py-1.5 text-[13px] font-medium capitalize text-neutral-50'
                : 'rounded-pill px-3.5 py-1.5 text-[13px] capitalize text-neutral-500'
            }
          >
            {pane}
          </button>
        ))}
      </div>

      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 gap-0 overflow-hidden"
      >
        {/* Sources */}
        <section
          className={`min-h-0 shrink-0 border-r border-hairline ${
            mobilePane === 'sources' ? 'flex w-full' : 'hidden lg:flex'
          }`}
          style={{ width: widths.sources }}
        >
          {sourcesPane}
        </section>

        <Splitter
          onPointerDown={(event) => startDragging('sources', event)}
          onDoubleClick={reset}
          label="Resize the sources panel"
        />

        {/* Chat */}
        <section
          className={`min-h-0 min-w-0 flex-1 ${
            mobilePane === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {chatPane}
        </section>

        <Splitter
          onPointerDown={(event) => startDragging('studio', event)}
          onDoubleClick={reset}
          label="Resize the studio panel"
        />

        {/* Studio */}
        <section
          className={`min-h-0 shrink-0 border-l border-hairline ${
            mobilePane === 'studio' ? 'flex w-full' : 'hidden lg:flex'
          }`}
          style={{ width: widths.studio }}
        >
          {studioPane}
        </section>
      </div>

      <span className="sr-only">{readyCount} ready sources</span>
      <button type="button" className="hidden" onClick={() => update({})}>
        reset widths
      </button>

      <EmojiIconPicker
        open={pickingIcon}
        value={notebook?.icon ?? '📓'}
        onClose={() => setPickingIcon(false)}
        onChange={(icon) => void changeIcon(icon)}
      />
    </div>
  );
}

function Splitter({
  onPointerDown,
  onDoubleClick,
  label,
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  label: string;
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className="group relative hidden w-px shrink-0 cursor-col-resize bg-transparent transition hover:bg-accent/50 lg:block"
    >
      <span className="absolute inset-y-0 -left-1 w-3" />
    </div>
  );
}
