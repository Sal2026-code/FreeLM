/**
 * FreeLM — mobile notebook data layer.
 *
 * A single provider per notebook keeps the Sources, Chat and Studio screens
 * in sync without prop drilling or duplicated fetching.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type {
  Message,
  Notebook,
  NotebookOverview,
  NotebookSettings,
  Note,
  Source,
  StudioOutput,
  Thread,
} from '@freelm/shared';

import { api } from './api';

interface NotebookContextValue {
  notebookId: string;
  notebook: Notebook | null;
  sources: Source[];
  threads: Thread[];
  activeThreadId: string | null;
  messages: Message[];
  outputs: StudioOutput[];
  notes: Note[];
  overview: NotebookOverview | null;
  settings: NotebookSettings | null;
  loading: boolean;
  error: string | null;
  selectedSourceIds: string[];
  setSelectedSourceIds: (ids: string[]) => void;
  setActiveThreadId: (id: string) => void;
  setMessages: (
    messages: Message[] | ((current: Message[]) => Message[]),
  ) => void;
  refresh: () => Promise<void>;
  refreshOverview: () => Promise<void>;
  createThread: () => Promise<void>;
  updateNotebook: (patch: Partial<Notebook>) => Promise<void>;
}

const NotebookContext = createContext<NotebookContextValue | null>(null);

export function useNotebook(): NotebookContextValue {
  const context = useContext(NotebookContext);
  if (!context) {
    throw new Error('useNotebook must be used inside a NotebookProvider.');
  }
  return context;
}

export function NotebookProvider({
  notebookId,
  children,
}: {
  notebookId: string;
  children: ReactNode;
}) {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [outputs, setOutputs] = useState<StudioOutput[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [overview, setOverview] = useState<NotebookOverview | null>(null);
  const [settings, setSettings] = useState<NotebookSettings | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [
        nextSources,
        nextThreads,
        nextOutputs,
        nextNotes,
        nextOverview,
        nextSettings,
      ] = await Promise.all([
        api.listSources(notebookId),
        api.listThreads(notebookId),
        api.listOutputs(notebookId),
        api.listNotes(notebookId),
        api.getOverview(notebookId),
        api.getSettings(notebookId),
      ]);

      setSources(nextSources);
      setThreads(nextThreads);
      setOutputs(nextOutputs);
      setNotes(nextNotes);
      setOverview(nextOverview);
      setSettings(nextSettings);

      const ready = nextSources
        .filter((source) => source.status === 'ready')
        .map((source) => source.id);
      setSelectedSourceIds((current) =>
        current.length > 0 ? current.filter((id) => ready.includes(id)) : ready,
      );

      setActiveThreadId((current) => {
        if (current && nextThreads.some((thread) => thread.id === current)) {
          return current;
        }
        return nextThreads[0]?.id ?? null;
      });

      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not load the notebook.',
      );
    } finally {
      setLoading(false);
    }
  }, [notebookId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    api
      .listMessages(notebookId, activeThreadId)
      .then((list) => {
        if (!cancelled) setMessages(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [notebookId, activeThreadId]);

  const refreshOverview = useCallback(async () => {
    try {
      setOverview(await api.getOverview(notebookId));
    } catch {
      /* the overview is optional */
    }
  }, [notebookId]);

  const createThread = useCallback(async () => {
    const thread = await api.createThread(notebookId);
    setThreads((current) => [thread, ...current]);
    setActiveThreadId(thread.id);
  }, [notebookId]);

  const updateNotebook = useCallback(
    async (patch: Partial<Notebook>) => {
      const updated = await api.updateNotebook(notebookId, patch);
      setNotebook(updated);
    },
    [notebookId],
  );

  useEffect(() => {
    api
      .updateNotebook(notebookId, {})
      .then((updated) => setNotebook(updated))
      .catch(() => undefined);
  }, [notebookId]);

  const value = useMemo<NotebookContextValue>(
    () => ({
      notebookId,
      notebook,
      sources,
      threads,
      activeThreadId,
      messages,
      outputs,
      notes,
      overview,
      settings,
      loading,
      error,
      selectedSourceIds,
      setSelectedSourceIds,
      setActiveThreadId,
      setMessages,
      refresh,
      refreshOverview,
      createThread,
      updateNotebook,
    }),
    [
      notebookId,
      notebook,
      sources,
      threads,
      activeThreadId,
      messages,
      outputs,
      notes,
      overview,
      settings,
      loading,
      error,
      selectedSourceIds,
      refresh,
      refreshOverview,
      createThread,
      updateNotebook,
    ],
  );

  return (
    <NotebookContext.Provider value={value}>{children}</NotebookContext.Provider>
  );
}
