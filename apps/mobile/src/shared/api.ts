/**
 * FreeLM — typed API client.
 *
 * Used by the web app and the mobile app so both talk to the server the
 * exact same way. Handles JSON, multipart uploads, errors and SSE streams.
 */

import type {
  ApiError,
  ChatMode,
  CoCreationPlan,
  Message,
  Notebook,
  NotebookOverview,
  NotebookSettings,
  Note,
  ResearchCandidate,
  ResearchMode,
  Session,
  Source,
  SourceLabel,
  StudioOutput,
  StudioToolType,
  Thread,
  WorkspaceEvent,
} from './types';

export class FreeLMApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'FreeLMApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Extra headers, e.g. an Authorization bearer token. */
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined | null>;
}

export class FreeLMClient {
  readonly baseUrl: string;
  private readonly extraHeaders: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.extraHeaders = options.headers ?? {};
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, signal, headers = {}, query } = options;

    const requestHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...this.extraHeaders,
      ...headers,
    };

    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await this.fetchImpl(this.buildUrl(path, query), {
      method,
      headers: requestHeaders,
      ...(payload ? { body: payload } : {}),
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      let code = 'HTTP_ERROR';
      let message = `Request failed with status ${response.status}`;
      let details: unknown;
      try {
        const parsed = (await response.json()) as Partial<ApiError>;
        if (parsed.error) message = parsed.error;
        if (parsed.code) code = parsed.code;
        details = parsed.details;
      } catch {
        /* non-JSON error body */
      }
      throw new FreeLMApiError(message, code, response.status, details);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  // -------------------------------------------------------------------------
  // Session
  // -------------------------------------------------------------------------

  session(): Promise<Session> {
    return this.request<Session>('/api/session');
  }

  // -------------------------------------------------------------------------
  // Notebooks
  // -------------------------------------------------------------------------

  listNotebooks(filter?: {
    scope?: 'all' | 'mine' | 'featured';
    search?: string;
    sort?: 'recent' | 'title' | 'sources';
  }): Promise<Notebook[]> {
    return this.request<Notebook[]>('/api/notebooks', { query: { ...filter } });
  }

  createNotebook(input: {
    title: string;
    description?: string;
    icon?: string;
    kind?: 'regular' | 'study';
    learningGoal?: string;
  }): Promise<Notebook> {
    return this.request<Notebook>('/api/notebooks', { method: 'POST', body: input });
  }

  getNotebook(id: string): Promise<Notebook> {
    return this.request<Notebook>(`/api/notebooks/${id}`);
  }

  updateNotebook(
    id: string,
    patch: Partial<Pick<Notebook, 'title' | 'description' | 'icon' | 'isPinned' | 'kind' | 'learningGoal'>>,
  ): Promise<Notebook> {
    return this.request<Notebook>(`/api/notebooks/${id}`, { method: 'PATCH', body: patch });
  }

  deleteNotebook(id: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(`/api/notebooks/${id}`, { method: 'DELETE' });
  }

  getSettings(id: string): Promise<NotebookSettings> {
    return this.request<NotebookSettings>(`/api/notebooks/${id}/settings`);
  }

  updateSettings(
    id: string,
    patch: Partial<NotebookSettings>,
  ): Promise<NotebookSettings> {
    return this.request<NotebookSettings>(`/api/notebooks/${id}/settings`, {
      method: 'PATCH',
      body: patch,
    });
  }

  // -------------------------------------------------------------------------
  // Sources
  // -------------------------------------------------------------------------

  listSources(notebookId: string): Promise<Source[]> {
    return this.request<Source[]>(`/api/notebooks/${notebookId}/sources`);
  }

  uploadSources(
    notebookId: string,
    files: File[] | { uri: string; name: string; type: string }[],
  ): Promise<Source[]> {
    const form = new FormData();
    for (const file of files) {
      if (file instanceof File) {
        form.append('files', file, file.name);
      } else {
        form.append('files', {
          uri: file.uri,
          name: file.name,
          type: file.type,
        } as unknown as Blob);
      }
    }
    return this.request<Source[]>(`/api/notebooks/${notebookId}/sources/upload`, {
      method: 'POST',
      body: form,
    });
  }

  addTextSource(
    notebookId: string,
    input: { title: string; text: string },
  ): Promise<Source> {
    return this.request<Source>(`/api/notebooks/${notebookId}/sources/text`, {
      method: 'POST',
      body: input,
    });
  }

  addWebSource(
    notebookId: string,
    input: { url: string; title?: string },
  ): Promise<Source> {
    return this.request<Source>(`/api/notebooks/${notebookId}/sources/web`, {
      method: 'POST',
      body: input,
    });
  }

  addYouTubeSource(
    notebookId: string,
    input: { url: string; title?: string },
  ): Promise<Source> {
    return this.request<Source>(`/api/notebooks/${notebookId}/sources/youtube`, {
      method: 'POST',
      body: input,
    });
  }

  deleteSource(notebookId: string, sourceId: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(`/api/notebooks/${notebookId}/sources/${sourceId}`, {
      method: 'DELETE',
    });
  }

  renameSource(
    notebookId: string,
    sourceId: string,
    title: string,
  ): Promise<Source> {
    return this.request<Source>(`/api/notebooks/${notebookId}/sources/${sourceId}`, {
      method: 'PATCH',
      body: { title },
    });
  }

  retrySource(notebookId: string, sourceId: string): Promise<Source> {
    return this.request<Source>(
      `/api/notebooks/${notebookId}/sources/${sourceId}/retry`,
      { method: 'POST' },
    );
  }

  getSourceChunks(notebookId: string, sourceId: string): Promise<Source> {
    return this.request<Source>(`/api/notebooks/${notebookId}/sources/${sourceId}`);
  }

  // -------------------------------------------------------------------------
  // Labels
  // -------------------------------------------------------------------------

  listLabels(notebookId: string): Promise<SourceLabel[]> {
    return this.request<SourceLabel[]>(`/api/notebooks/${notebookId}/sources/labels`);
  }

  createLabel(notebookId: string, name: string, color: string): Promise<SourceLabel> {
    return this.request<SourceLabel>(`/api/notebooks/${notebookId}/sources/labels`, {
      method: 'POST',
      body: { name, color },
    });
  }

  updateLabel(
    notebookId: string,
    labelId: string,
    patch: { name?: string; color?: string },
  ): Promise<SourceLabel> {
    return this.request<SourceLabel>(
      `/api/notebooks/${notebookId}/sources/labels/${labelId}`,
      { method: 'PATCH', body: patch },
    );
  }

  deleteLabel(notebookId: string, labelId: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(
      `/api/notebooks/${notebookId}/sources/labels/${labelId}`,
      { method: 'DELETE' },
    );
  }

  assignLabel(
    notebookId: string,
    labelId: string,
    sourceIds: string[],
  ): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(
      `/api/notebooks/${notebookId}/sources/labels/${labelId}/members`,
      { method: 'POST', body: { sourceIds } },
    );
  }

  // -------------------------------------------------------------------------
  // Research
  // -------------------------------------------------------------------------

  searchWeb(
    notebookId: string,
    input: { query: string; mode?: ResearchMode },
  ): Promise<{ candidates: ResearchCandidate[]; report?: string }> {
    return this.request<{ candidates: ResearchCandidate[]; report?: string }>(
      `/api/notebooks/${notebookId}/search`,
      { method: 'POST', body: input },
    );
  }

  // -------------------------------------------------------------------------
  // Threads & messages
  // -------------------------------------------------------------------------

  listThreads(notebookId: string): Promise<Thread[]> {
    return this.request<Thread[]>(`/api/notebooks/${notebookId}/threads`);
  }

  createThread(notebookId: string, title?: string): Promise<Thread> {
    return this.request<Thread>(`/api/notebooks/${notebookId}/threads`, {
      method: 'POST',
      body: { title },
    });
  }

  renameThread(notebookId: string, threadId: string, title: string): Promise<Thread> {
    return this.request<Thread>(`/api/notebooks/${notebookId}/threads/${threadId}`, {
      method: 'PATCH',
      body: { title },
    });
  }

  deleteThread(notebookId: string, threadId: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(`/api/notebooks/${notebookId}/threads/${threadId}`, {
      method: 'DELETE',
    });
  }

  listMessages(notebookId: string, threadId: string): Promise<Message[]> {
    return this.request<Message[]>(
      `/api/notebooks/${notebookId}/threads/${threadId}/messages`,
    );
  }

  clearMessages(notebookId: string, threadId: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(
      `/api/notebooks/${notebookId}/threads/${threadId}/messages`,
      { method: 'DELETE' },
    );
  }

  sendMessage(
    notebookId: string,
    threadId: string,
    input: {
      content: string;
      mode?: ChatMode;
      scope?: 'all' | 'selected';
      sourceIds?: string[];
      length?: 'short' | 'medium' | 'long';
    },
  ): Promise<Message> {
    return this.request<Message>(
      `/api/notebooks/${notebookId}/threads/${threadId}/messages`,
      { method: 'POST', body: input },
    );
  }

  // -------------------------------------------------------------------------
  // Overview
  // -------------------------------------------------------------------------

  getOverview(notebookId: string): Promise<NotebookOverview | null> {
    return this.request<NotebookOverview | null>(
      `/api/notebooks/${notebookId}/overview`,
    );
  }

  regenerateOverview(notebookId: string): Promise<NotebookOverview> {
    return this.request<NotebookOverview>(`/api/notebooks/${notebookId}/overview`, {
      method: 'POST',
    });
  }

  // -------------------------------------------------------------------------
  // Notes
  // -------------------------------------------------------------------------

  listNotes(notebookId: string): Promise<Note[]> {
    return this.request<Note[]>(`/api/notebooks/${notebookId}/notes`);
  }

  createNote(
    notebookId: string,
    input: { title: string; content: string; citationChunkIds?: string[] },
  ): Promise<Note> {
    return this.request<Note>(`/api/notebooks/${notebookId}/notes`, {
      method: 'POST',
      body: input,
    });
  }

  updateNote(
    notebookId: string,
    noteId: string,
    patch: { title?: string; content?: string },
  ): Promise<Note> {
    return this.request<Note>(`/api/notebooks/${notebookId}/notes/${noteId}`, {
      method: 'PATCH',
      body: patch,
    });
  }

  deleteNote(notebookId: string, noteId: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(`/api/notebooks/${notebookId}/notes/${noteId}`, {
      method: 'DELETE',
    });
  }

  promoteNoteToSource(notebookId: string, noteId: string): Promise<Source> {
    return this.request<Source>(`/api/notebooks/${notebookId}/notes/${noteId}/promote`, {
      method: 'POST',
    });
  }

  // -------------------------------------------------------------------------
  // Studio
  // -------------------------------------------------------------------------

  listOutputs(notebookId: string): Promise<StudioOutput[]> {
    return this.request<StudioOutput[]>(`/api/notebooks/${notebookId}/studio/outputs`);
  }

  getOutput(notebookId: string, outputId: string): Promise<StudioOutput> {
    return this.request<StudioOutput>(
      `/api/notebooks/${notebookId}/studio/outputs/${outputId}`,
    );
  }

  generateOutput(
    notebookId: string,
    input: {
      type: StudioToolType;
      sourceIds?: string[];
      prompt?: string;
      language?: string;
      options?: Record<string, unknown>;
    },
  ): Promise<StudioOutput> {
    return this.request<StudioOutput>(`/api/notebooks/${notebookId}/studio/generate`, {
      method: 'POST',
      body: input,
    });
  }

  deleteOutput(notebookId: string, outputId: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(
      `/api/notebooks/${notebookId}/studio/outputs/${outputId}`,
      { method: 'DELETE' },
    );
  }

  outputFileUrl(notebookId: string, outputId: string): string {
    return this.buildUrl(`/api/notebooks/${notebookId}/studio/outputs/${outputId}/file`);
  }

  // -------------------------------------------------------------------------
  // Co-creation (Oct 2026 feature)
  // -------------------------------------------------------------------------

  createCoCreation(
    notebookId: string,
    input: {
      artifactType: 'slide_deck' | 'video_overview';
      prompt: string;
    },
  ): Promise<CoCreationPlan> {
    return this.request<CoCreationPlan>(`/api/notebooks/${notebookId}/co-create`, {
      method: 'POST',
      body: input,
    });
  }

  updateCoCreation(
    notebookId: string,
    sessionId: string,
    patch: Partial<CoCreationPlan>,
  ): Promise<CoCreationPlan> {
    return this.request<CoCreationPlan>(
      `/api/notebooks/${notebookId}/co-create/${sessionId}`,
      { method: 'PATCH', body: patch },
    );
  }

  // -------------------------------------------------------------------------
  // Streaming
  // -------------------------------------------------------------------------

  /**
   * Open a Server-Sent Events stream.
   *
   * The server sends newline-delimited JSON payloads (not the default SSE
   * `data:` framing) so that both `EventSource` in the browser and a plain
   * `fetch` reader in React Native can consume it identically.
   */
  stream(
    path: string,
    options: { onEvent: (event: WorkspaceEvent) => void; signal?: AbortSignal } ,
  ): Promise<void> {
    const fetchImpl = this.fetchImpl;
    return (async () => {
      const response = await fetchImpl(this.buildUrl(path), {
        headers: { Accept: 'application/x-ndjson', ...this.extraHeaders },
        ...(options.signal ? { signal: options.signal } : {}),
      });
      if (!response.ok || !response.body) {
        throw new FreeLMApiError(
          `Stream failed with status ${response.status}`,
          'STREAM_ERROR',
          response.status,
        );
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            try {
              options.onEvent(JSON.parse(line) as WorkspaceEvent);
            } catch {
              /* ignore malformed frame */
            }
          }
          newlineIndex = buffer.indexOf('\n');
        }
      }
    })();
  }

  /**
   * Stream a chat answer token by token.
   *
   * Frames are NDJSON objects: `{ type: 'token' | 'citations' | 'done' | 'error', ... }`.
   */
  streamChat(
    notebookId: string,
    threadId: string,
    input: {
      content: string;
      mode?: ChatMode;
      scope?: 'all' | 'selected';
      sourceIds?: string[];
      length?: 'short' | 'medium' | 'long';
    },
    handlers: {
      onToken?: (token: string) => void;
      onCitations?: (citations: Message['citations']) => void;
      onDone?: (message: Message) => void;
      onError?: (error: { error: string; code: string }) => void;
    },
    signal?: AbortSignal,
  ): Promise<void> {
    return (async () => {
      const response = await this.fetchImpl(
        this.buildUrl(`/api/notebooks/${notebookId}/threads/${threadId}/stream`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson',
            ...this.extraHeaders,
          },
          body: JSON.stringify(input),
          ...(signal ? { signal } : {}),
        },
      );

      if (!response.ok || !response.body) {
        let message = `Chat failed with status ${response.status}`;
        let code = 'HTTP_ERROR';
        try {
          const parsed = (await response.json()) as Partial<ApiError>;
          if (parsed.error) message = parsed.error;
          if (parsed.code) code = parsed.code;
        } catch {
          /* non-JSON body */
        }
        handlers.onError?.({ error: message, code });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            try {
              const frame = JSON.parse(line) as {
                type: 'token' | 'citations' | 'done' | 'error';
                token?: string;
                citations?: Message['citations'];
                message?: Message;
                error?: string;
                code?: string;
              };
              if (frame.type === 'token' && frame.token) handlers.onToken?.(frame.token);
              if (frame.type === 'citations' && frame.citations) {
                handlers.onCitations?.(frame.citations);
              }
              if (frame.type === 'done' && frame.message) handlers.onDone?.(frame.message);
              if (frame.type === 'error') {
                handlers.onError?.({
                  error: frame.error ?? 'Unknown error',
                  code: frame.code ?? 'UNKNOWN',
                });
              }
            } catch {
              /* ignore malformed frame */
            }
          }
          newlineIndex = buffer.indexOf('\n');
        }
      }
    })();
  }
}

/** Create a client pointed at the local dev server. */
export function createClient(options: ApiClientOptions): FreeLMClient {
  return new FreeLMClient(options);
}
