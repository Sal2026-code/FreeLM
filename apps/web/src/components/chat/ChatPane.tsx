'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ChatMode,
  Message,
  Notebook,
  NotebookOverview,
  Source,
  Thread,
} from '@freelm/shared';
import { CHAT_MODES, RESPONSE_LENGTHS } from '@freelm/shared';

import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { Dropdown, Popover } from '@/components/ui/Dropdown';
import {
  Button,
  cn,
  IconButton,
  Spinner,
  useToast,
} from '@/components/ui/primitives';

export interface ChatPaneProps {
  notebook: Notebook | null;
  notebookId: string;
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onCreateThread: () => void;
  onDeleteThread: (id: string) => void;
  onRenameThread: (id: string, title: string) => void;
  messages: Message[];
  setMessages: (messages: Message[] | ((current: Message[]) => Message[])) => void;
  overview: NotebookOverview | null;
  onRefreshOverview: () => void;
  sources: Source[];
  selectedSourceIds: string[];
  onSelectSources: (ids: string[]) => void;
  onSendToChat: (content: string) => void | Promise<void>;
  onSavedToNote: () => void;
  /** Opens the device emoji picker so the notebook icon can be changed. */
  onEditIcon?: () => void;
}

export function ChatPane({
  notebook,
  notebookId,
  threads,
  activeThreadId,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  onRenameThread,
  messages,
  setMessages,
  overview,
  onRefreshOverview,
  sources,
  selectedSourceIds,
  onSelectSources,
  onSendToChat,
  onSavedToNote,
  onEditIcon,
}: ChatPaneProps) {
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<ChatMode>('exploratory');
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [customInstructions, setCustomInstructions] = useState('');
  const [highlightChunkId, setHighlightChunkId] = useState<string | null>(null);

  const readySources = useMemo(
    () => sources.filter((source) => source.status === 'ready'),
    [sources],
  );
  const canChat = readySources.length > 0;

  // Auto-scroll to the newest message.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Load the notebook's saved chat configuration.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/notebooks/${notebookId}/settings`);
      if (response.ok && !cancelled) {
        const settings = (await response.json()) as {
          chatMode: ChatMode;
          responseLength: 'short' | 'medium' | 'long';
          defaultScope: 'all' | 'selected';
          customInstructions: string;
        };
        setMode(settings.chatMode);
        setLength(settings.responseLength);
        setScope(settings.defaultScope);
        setCustomInstructions(settings.customInstructions);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId]);

  // Listen for messages pushed in from elsewhere (sources, studio).
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) void send(detail);
    };
    window.addEventListener('freelm:send-message', handler);
    return () => window.removeEventListener('freelm:send-message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, mode, scope, length]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;

      setInput('');
      setSending(true);

      const optimistic: Message = {
        id: `local-${Date.now()}`,
        threadId: activeThreadId ?? '',
        role: 'user',
        content,
        mode,
        citations: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, optimistic]);

      try {
        const response = await fetch(
          `/api/notebooks/${notebookId}/threads/${activeThreadId}/stream`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content,
              mode,
              scope,
              length,
              ...(scope === 'selected'
                ? { sourceIds: selectedSourceIds }
                : {}),
            }),
          },
        );

        if (!response.ok || !response.body) {
          const error = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(error.error ?? 'The request failed.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantText = '';
        let citations: Message['citations'] = [];

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (line) {
              const frame = JSON.parse(line) as {
                type: string;
                token?: string;
                citations?: Message['citations'];
                message?: Message;
                error?: string;
              };

              if (frame.type === 'token' && frame.token) {
                assistantText += frame.token;
                setMessages((current) => {
                  const last = current[current.length - 1];
                  if (!last || last.role !== 'assistant' || !last.id.startsWith('local-')) {
                    return [
                      ...current,
                      {
                        id: `streaming-${Date.now()}`,
                        threadId: activeThreadId ?? '',
                        role: 'assistant',
                        content: assistantText,
                        mode,
                        citations,
                        createdAt: new Date().toISOString(),
                      },
                    ];
                  }
                  return [
                    ...current.slice(0, -1),
                    { ...last, content: assistantText },
                  ];
                });
              }

              if (frame.type === 'citations' && frame.citations) {
                citations = frame.citations;
              }

              if (frame.type === 'done' && frame.message) {
                setMessages((current) => [
                  ...current.filter(
                    (message) => !message.id.startsWith('local-'),
                  ),
                  frame.message!,
                ]);
              }

              if (frame.type === 'error') {
                throw new Error(frame.error ?? 'The request failed.');
              }
            }
            newlineIndex = buffer.indexOf('\n');
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Something went wrong.';
        toast.push({
          tone: 'error',
          title: 'Could not answer that',
          description: message,
        });
        setMessages((current) => current.slice(0, -1));
      } finally {
        setSending(false);
      }
    },
    [
      activeThreadId,
      length,
      mode,
      notebookId,
      scope,
      selectedSourceIds,
      sending,
      setMessages,
      toast,
    ],
  );

  const activeThread = threads.find((thread) => thread.id === activeThreadId);

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2 border-b border-hairline px-3 py-2">
        <h2 className="text-sm font-semibold text-neutral-100">Chat</h2>

        <Dropdown
          align="start"
          label="Switch chat"
          trigger={
            <span className="pill h-7 max-w-[16rem] px-2.5 text-[12.5px]">
              <span className="material-symbols-rounded text-[16px]" aria-hidden>
                forum
              </span>
              <span className="truncate">
                {activeThread?.title ?? 'New chat'}
              </span>
              <span className="material-symbols-rounded text-[14px] text-neutral-500">
                expand_more
              </span>
            </span>
          }
          items={[
            {
              id: 'new',
              label: 'New chat',
              icon: 'add',
              onSelect: onCreateThread,
            },
            ...threads.map((thread) => ({
              id: thread.id,
              label: thread.title,
              icon: 'chat',
              onSelect: () => onSelectThread(thread.id),
            })),
          ]}
        />

        <div className="ml-auto flex items-center gap-0.5">
          <Popover
            align="end"
            label="Configure chat"
            panelWidth="w-80"
            trigger={
              <span className="icon-button">
                <span className="material-symbols-rounded text-[19px]" aria-hidden>
                  tune
                </span>
              </span>
            }
          >
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-neutral-300">
                  Response mode
                </p>
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as ChatMode)}
                  className="field h-9 py-0 text-[13px]"
                >
                  {CHAT_MODES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11.5px] leading-4 text-neutral-500">
                  {CHAT_MODES.find((option) => option.value === mode)?.description}
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-[12px] font-medium text-neutral-300">
                  Answer length
                </p>
                <div className="flex gap-1">
                  {RESPONSE_LENGTHS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setLength(option.value)}
                      className={cn(
                        'flex-1 rounded-pill border px-2 py-1 text-[12px] transition',
                        length === option.value
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-hairline bg-surface-2 text-neutral-400 hover:text-neutral-200',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[12px] font-medium text-neutral-300">
                  Custom instructions
                </p>
                <textarea
                  value={customInstructions}
                  onChange={(event) => setCustomInstructions(event.target.value)}
                  onBlur={async () => {
                    await fetch(`/api/notebooks/${notebookId}/settings`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ customInstructions }),
                    });
                  }}
                  rows={4}
                  placeholder="e.g. Always answer in British English and use headings."
                  className="field resize-none text-[12.5px]"
                />
              </div>

              <div>
                <p className="mb-1.5 text-[12px] font-medium text-neutral-300">
                  Source scope
                </p>
                <div className="flex gap-1">
                  {(['all', 'selected'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setScope(option)}
                      className={cn(
                        'flex-1 rounded-pill border px-2 py-1 text-[12px] transition',
                        scope === option
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-hairline bg-surface-2 text-neutral-400 hover:text-neutral-200',
                      )}
                    >
                      {option === 'all' ? 'All sources' : 'Selected sources'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Popover>

          <Dropdown
            align="end"
            label="Chat options"
            trigger={
              <span className="icon-button">
                <span className="material-symbols-rounded text-[19px]" aria-hidden>
                  more_vert
                </span>
              </span>
            }
            items={[
              {
                id: 'rename',
                label: 'Rename chat',
                icon: 'edit',
                onSelect: () => {
                  if (!activeThread) return;
                  const next = window.prompt('Chat title', activeThread.title);
                  if (next?.trim()) onRenameThread(activeThread.id, next.trim());
                },
              },
              {
                id: 'new',
                label: 'New chat',
                icon: 'add',
                onSelect: onCreateThread,
              },
              {
                id: 'clear',
                label: 'Delete chat history',
                icon: 'delete',
                destructive: true,
                separatorBefore: true,
                onSelect: async () => {
                  if (!activeThread) return;
                  const response = await fetch(
                    `/api/notebooks/${notebookId}/threads/${activeThread.id}/messages`,
                    { method: 'DELETE' },
                  );
                  if (response.ok) setMessages([]);
                },
              },
              {
                id: 'delete',
                label: 'Delete this chat',
                icon: 'delete_sweep',
                destructive: true,
                onSelect: () => {
                  if (!activeThread) return;
                  onDeleteThread(activeThread.id);
                },
              },
            ]}
          />
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-5">
          {messages.length === 0 ? (
            <OverviewCard
              notebook={notebook}
              overview={overview}
              readyCount={readySources.length}
              onRefresh={onRefreshOverview}
              onAsk={(question) => void send(question)}
              onEditIcon={onEditIcon}
              onOpenSources={() => {
                window.dispatchEvent(
                  new CustomEvent('freelm:open-sources'),
                );
              }}
            />
          ) : null}

          <div className="space-y-5">
            {messages.map((message, messageIndex) => {
              const isLast = messageIndex === messages.length - 1;
              const isStreaming =
                sending && isLast && message.role === 'assistant';
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  streaming={isStreaming}
                  onCitationClick={(chunkId, sourceId) => {
                    setHighlightChunkId(chunkId);
                    window.dispatchEvent(
                      new CustomEvent('freelm:open-source', {
                        detail: { chunkId, sourceId },
                      }),
                    );
                  }}
                  onSavedToNote={onSavedToNote}
                  onSendToChat={onSendToChat}
                />
              );
            })}
          </div>

          {sending ? (
            <div className="anim-fade-in mt-4 flex items-center gap-2 text-[13px] text-neutral-500">
              <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="anim-float h-1.5 w-1.5 rounded-full bg-neutral-500"
                    style={{ animationDelay: `${dot * 140}ms` }}
                  />
                ))}
              </span>
              Thinking…
            </div>
          ) : null}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-hairline px-3 py-2.5">
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-2xl border border-hairline bg-surface-2 p-2 transition focus-within:border-hairline-strong">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              disabled={!canChat}
              rows={1}
              placeholder={
                canChat
                  ? 'Start typing…'
                  : 'Add a source to start researching'
              }
              className="max-h-48 w-full resize-none bg-transparent px-1.5 py-1 text-[14px] leading-6 text-neutral-100 outline-none placeholder:text-neutral-500 disabled:cursor-not-allowed"
            />
            <div className="flex items-center gap-1.5 px-1 pt-1">
              <span className="text-[12px] text-neutral-500">
                {scope === 'selected'
                  ? `${selectedSourceIds.length} selected`
                  : `${readySources.length} sources`}
              </span>

              {scope === 'selected' ? (
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className="text-[12px] text-accent hover:text-accent-hover"
                >
                  Use all
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  const next = scope === 'all' ? 'selected' : 'all';
                  setScope(next);
                }}
                className="pill ml-1 h-7 px-2 text-[12px]"
              >
                <span className="material-symbols-rounded text-[15px]" aria-hidden>
                  library_books
                </span>
                {scope === 'all' ? 'All sources' : 'Selected sources'}
              </button>

              <button
                type="button"
                onClick={() => {
                  const index = CHAT_MODES.findIndex((m) => m.value === mode);
                  const next = CHAT_MODES[(index + 1) % CHAT_MODES.length]!;
                  setMode(next.value);
                }}
                className="pill h-7 px-2 text-[12px]"
              >
                <span className="material-symbols-rounded text-[15px]" aria-hidden>
                  psychology
                </span>
                {CHAT_MODES.find((m) => m.value === mode)?.label}
              </button>

              <button
                type="button"
                onClick={() => void send(input)}
                disabled={!canChat || !input.trim() || sending}
                aria-label="Send message"
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-neutral-200 transition hover:bg-neutral-700 disabled:opacity-40"
              >
                <span className="material-symbols-rounded text-[18px]" aria-hidden>
                  arrow_forward
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  streaming,
  onCitationClick,
  onSavedToNote,
  onSendToChat,
}: {
  message: Message;
  streaming?: boolean;
  onCitationClick: (chunkId: string, sourceId: string) => void;
  onSavedToNote: () => void;
  onSendToChat: (content: string) => void | Promise<void>;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="anim-message-in max-w-[85%] rounded-2xl rounded-br-md bg-surface-2 px-3.5 py-2.5 text-[14px] leading-6 text-neutral-100">
          {message.content}
        </div>
      </div>
    );
  }

  async function copy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function saveToNote() {
    const response = await fetch(`/api/notebooks/${message.threadId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Saved from chat',
        content: message.content,
        citationChunkIds: message.citations.map((citation) => citation.chunkId),
      }),
    });
    if (response.ok) {
      toast.push({ tone: 'success', title: 'Saved to note' });
      onSavedToNote();
    }
  }

  const citationMap = useMemo(() => {
    const map = new Map(message.citations.map((c) => [c.chunkId, c]));
    return map;
  }, [message.citations]);

  return (
    <article className="group anim-message-in">
      <MarkdownRenderer
        content={message.content}
        citations={message.citations}
        onCitationClick={(chunkId) => {
          const citation = citationMap.get(chunkId);
          onCitationClick(chunkId, citation?.sourceId ?? '');
        }}
      />

      {/* A blinking caret while the answer is still streaming in. */}
      {streaming ? (
        <span className="caret text-neutral-400" aria-hidden />
      ) : null}

      <div className="mt-2.5 flex items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          icon="bookmark"
          onClick={() => void saveToNote()}
        >
          Save to note
        </Button>
        <IconButton
          icon={copied ? 'check' : 'content_copy'}
          label={copied ? 'Copied' : 'Copy'}
          onClick={() => void copy()}
        />
        <IconButton
          icon="thumb_up"
          label="Good answer"
          active={feedback === 'up'}
          onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
        />
        <IconButton
          icon="thumb_down"
          label="Bad answer"
          active={feedback === 'down'}
          onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
        />
        {message.citations.length > 0 ? (
          <button
            type="button"
            onClick={() => void onSendToChat('Summarise the cited passages.')}
            className="ml-1 text-[12px] text-neutral-500 hover:text-neutral-300"
          >
            {message.citations.length} citation
            {message.citations.length === 1 ? '' : 's'}
          </button>
        ) : null}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Overview card
// ---------------------------------------------------------------------------

function OverviewCard({
  notebook,
  overview,
  readyCount,
  onRefresh,
  onAsk,
  onEditIcon,
  onOpenSources,
}: {
  notebook: Notebook | null;
  overview: NotebookOverview | null;
  readyCount: number;
  onRefresh: () => void;
  onAsk: (question: string) => void;
  onEditIcon?: () => void;
  onOpenSources: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  if (readyCount === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
          <span className="material-symbols-rounded text-[20px]" aria-hidden>
            add
          </span>
        </span>
        <p className="text-[15px] font-medium text-neutral-100">
          Add a source to get started
        </p>
        <Button variant="primary" icon="upload_file" onClick={onOpenSources}>
          Upload a source
        </Button>
      </div>
    );
  }

  if (!overview || !overview.content) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Spinner />
        <p className="text-[13px] text-neutral-500">Reading your sources…</p>
      </div>
    );
  }

  return (
    <div className="mb-6">
      {/* Icon + title + source count */}
      <div className="mb-3 flex items-start gap-3">
        <button
          type="button"
          onClick={onEditIcon}
          title="Change the notebook icon"
          aria-label="Change the notebook icon"
          className="-m-1 rounded-xl p-1 text-4xl leading-none transition hover:bg-surface-2"
        >
          <span aria-hidden>{notebook?.icon ?? '📓'}</span>
        </button>
        <div className="min-w-0">
          <p className="text-[13px] text-neutral-500">
            {readyCount} {readyCount === 1 ? 'source' : 'sources'}
          </p>
          <h3 className="truncate text-xl font-semibold text-neutral-50">
            {notebook?.title ?? 'Notebook'}
          </h3>
        </div>
      </div>

      <MarkdownRenderer
        content={overview.content}
        citations={overview.citations}
        onCitationClick={() => undefined}
      />

      {/* Action row */}
      <div className="mt-3 flex items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          icon="bookmark"
          onClick={async () => {
            const response = await fetch(
              `/api/notebooks/${notebook?.id}/notes`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: `${notebook?.title ?? 'Notebook'} overview`,
                  content: overview.content,
                  citationChunkIds: overview.citations.map(
                    (citation) => citation.chunkId,
                  ),
                }),
              },
            );
            if (response.ok) {
              toast.push({ tone: 'success', title: 'Saved to note' });
            }
          }}
        >
          Save to note
        </Button>
        <IconButton
          icon={copied ? 'check' : 'content_copy'}
          label="Copy overview"
          onClick={async () => {
            await navigator.clipboard.writeText(overview.content);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        />
        <IconButton icon="refresh" label="Refresh overview" onClick={onRefresh} />
      </div>

      {/* Suggested questions */}
      {overview.suggestedQuestions.length > 0 ? (
        <div className="mt-4 flex flex-col items-start gap-2">
          {overview.suggestedQuestions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onAsk(question)}
              className="max-w-full rounded-xl border border-hairline bg-surface-2 px-3.5 py-2 text-left text-[13px] text-neutral-200 transition hover:border-hairline-strong hover:bg-surface-3"
            >
              {question}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
