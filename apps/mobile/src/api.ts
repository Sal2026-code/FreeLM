/**
 * FreeLM — mobile API client.
 *
 * A thin wrapper over the same REST API the web app uses, plus an NDJSON
 * reader for streaming chat answers.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

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

const DEFAULT_API_URL = 'http://localhost:3000';

let apiUrl = DEFAULT_API_URL;

export function setApiUrl(url: string): void {
  apiUrl = url.replace(/\/$/, '');
}

export function getApiUrl(): string {
  return apiUrl;
}

/**
 * Load the API URL the user configured, falling back to the build-time
 * default and then to localhost.
 */
export async function loadApiUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem('freelm.apiUrl');
    if (stored) {
      apiUrl = stored;
      return apiUrl;
    }
  } catch {
    /* fall through to the default */
  }
  return apiUrl;
}

export async function saveApiUrl(url: string): Promise<void> {
  apiUrl = url.replace(/\/$/, '');
  await AsyncStorage.setItem('freelm.apiUrl', apiUrl);
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };

  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(body ? { body } : {}),
  });

  if (!response.ok) {
    let code = 'HTTP_ERROR';
    let message = `Request failed (${response.status}).`;
    try {
      const parsed = (await response.json()) as { error?: string; code?: string };
      if (parsed.error) message = parsed.error;
      if (parsed.code) code = parsed.code;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(message, code, response.status);
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Notebooks
// ---------------------------------------------------------------------------

export const api = {
  listNotebooks: (scope: 'all' | 'mine' | 'featured' = 'mine') =>
    request<Notebook[]>(`/api/notebooks?scope=${scope}`),

  createNotebook: (input: { title: string; description?: string; icon?: string }) =>
    request<Notebook>('/api/notebooks', { method: 'POST', body: input }),

  updateNotebook: (
    id: string,
    patch: Partial<Pick<Notebook, 'title' | 'description' | 'icon' | 'isPinned'>>,
  ) => request<Notebook>(`/api/notebooks/${id}`, { method: 'PATCH', body: patch }),

  deleteNotebook: (id: string) =>
    request<{ ok: true }>(`/api/notebooks/${id}`, { method: 'DELETE' }),

  getSettings: (id: string) => request<NotebookSettings>(`/api/notebooks/${id}/settings`),

  updateSettings: (id: string, patch: Partial<NotebookSettings>) =>
    request<NotebookSettings>(`/api/notebooks/${id}/settings`, {
      method: 'PATCH',
      body: patch,
    }),

  // --- Sources -------------------------------------------------------------

  listSources: (notebookId: string) =>
    request<Source[]>(`/api/notebooks/${notebookId}/sources`),

  getSource: (notebookId: string, sourceId: string) =>
    request<
      Source & {
        extractedText: string | null;
        chunks: {
          id: string;
          chunkIndex: number;
          text: string;
          sectionTitle: string | null;
          pageNumber: number | null;
        }[];
      }
    >(`/api/notebooks/${notebookId}/sources/${sourceId}`),

  addTextSource: (notebookId: string, title: string, text: string) =>
    request<Source>(`/api/notebooks/${notebookId}/sources/text`, {
      method: 'POST',
      body: { title, text },
    }),

  addWebSource: (notebookId: string, url: string) =>
    request<Source>(`/api/notebooks/${notebookId}/sources/web`, {
      method: 'POST',
      body: { url },
    }),

  addYouTubeSource: (notebookId: string, url: string) =>
    request<Source>(`/api/notebooks/${notebookId}/sources/youtube`, {
      method: 'POST',
      body: { url },
    }),

  deleteSource: (notebookId: string, sourceId: string) =>
    request<{ ok: true }>(`/api/notebooks/${notebookId}/sources/${sourceId}`, {
      method: 'DELETE',
    }),

  retrySource: (notebookId: string, sourceId: string) =>
    request<Source>(`/api/notebooks/${notebookId}/sources/${sourceId}/retry`, {
      method: 'POST',
    }),

  /**
   * Upload a file.
   *
   * React Native's FormData accepts `{ uri, name, type }` objects, which is
   * what the `fetch` implementation on the native side understands.
   */
  uploadFile: async (
    notebookId: string,
    file: { uri: string; name: string; mimeType: string },
  ): Promise<Source[]> => {
    const form = new FormData();
    form.append('files', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob);

    const response = await fetch(`${apiUrl}/api/notebooks/${notebookId}/sources/upload`, {
      method: 'POST',
      body: form,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const parsed = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new ApiError(
        parsed.error ?? 'Upload failed.',
        'UPLOAD_FAILED',
        response.status,
      );
    }

    return (await response.json()) as Source[];
  },

  // --- Chat ---------------------------------------------------------------

  listThreads: (notebookId: string) =>
    request<Thread[]>(`/api/notebooks/${notebookId}/threads`),

  createThread: (notebookId: string) =>
    request<Thread>(`/api/notebooks/${notebookId}/threads`, {
      method: 'POST',
      body: {},
    }),

  deleteThread: (notebookId: string, threadId: string) =>
    request<{ ok: true }>(`/api/notebooks/${notebookId}/threads/${threadId}`, {
      method: 'DELETE',
    }),

  listMessages: (notebookId: string, threadId: string) =>
    request<Message[]>(`/api/notebooks/${notebookId}/threads/${threadId}/messages`),

  deleteMessages: (notebookId: string, threadId: string) =>
    request<{ ok: true }>(
      `/api/notebooks/${notebookId}/threads/${threadId}/messages`,
      { method: 'DELETE' },
    ),

  // --- Overview & notes ---------------------------------------------------

  getOverview: (notebookId: string) =>
    request<NotebookOverview | null>(`/api/notebooks/${notebookId}/overview`),

  regenerateOverview: (notebookId: string) =>
    request<NotebookOverview>(`/api/notebooks/${notebookId}/overview`, {
      method: 'POST',
    }),

  listNotes: (notebookId: string) =>
    request<Note[]>(`/api/notebooks/${notebookId}/notes`),

  createNote: (notebookId: string, title: string, content: string) =>
    request<Note>(`/api/notebooks/${notebookId}/notes`, {
      method: 'POST',
      body: { title, content },
    }),

  promoteNote: (notebookId: string, noteId: string) =>
    request<Source>(`/api/notebooks/${notebookId}/notes/${noteId}/promote`, {
      method: 'POST',
    }),

  // --- Studio -------------------------------------------------------------

  listOutputs: (notebookId: string) =>
    request<StudioOutput[]>(`/api/notebooks/${notebookId}/studio/outputs`),

  generate: (
    notebookId: string,
    input: {
      type: string;
      sourceIds?: string[];
      prompt?: string;
      language?: string;
      options?: Record<string, unknown>;
    },
  ) =>
    request<StudioOutput>(`/api/notebooks/${notebookId}/studio/generate`, {
      method: 'POST',
      body: input,
    }),

  deleteOutput: (notebookId: string, outputId: string) =>
    request<{ ok: true }>(
      `/api/notebooks/${notebookId}/studio/outputs/${outputId}`,
      { method: 'DELETE' },
    ),

  // --- Research ------------------------------------------------------------

  searchWeb: (notebookId: string, query: string) =>
    request<{ candidates: { title: string; url: string; snippet: string }[] }>(
      `/api/notebooks/${notebookId}/search`,
      { method: 'POST', body: { query, mode: 'fast' } },
    ),
};

/**
 * Stream a chat answer.
 *
 * The server sends newline-delimited JSON frames.
 */
export async function streamChat(
  notebookId: string,
  threadId: string,
  input: {
    content: string;
    mode?: string;
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
  const response = await fetch(
    `${apiUrl}/api/notebooks/${notebookId}/threads/${threadId}/stream`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    },
  );

  if (!response.ok || !response.body) {
    let message = `Chat failed (${response.status}).`;
    let code = 'HTTP_ERROR';
    try {
      const parsed = (await response.json()) as { error?: string; code?: string };
      if (parsed.error) message = parsed.error;
      if (parsed.code) code = parsed.code;
    } catch {
      /* ignore */
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
            type: string;
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
}
