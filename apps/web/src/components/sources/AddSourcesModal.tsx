'use client';

import { useCallback, useRef, useState } from 'react';

import { Modal } from '@/components/ui/Modal';
import { Button, cn, Spinner, useToast } from '@/components/ui/primitives';

export interface AddSourcesModalProps {
  open: boolean;
  notebookId: string;
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}

type Tab = 'upload' | 'website' | 'drive' | 'text' | 'youtube';

/**
 * The "Add sources to start researching" dialog.
 *
 * Five entry points, matching the reference: Upload Files, Websites, Cloud
 * Drive, Copied text and YouTube.
 */
export function AddSourcesModal({
  open,
  notebookId,
  onClose,
  onAdded,
}: AddSourcesModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>('upload');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      try {
        const form = new FormData();
        for (const file of files) form.append('files', file, file.name);
        const response = await fetch(
          `/api/notebooks/${notebookId}/sources/upload`,
          { method: 'POST', body: form },
        );
        if (response.ok) {
          const created = (await response.json()) as { title: string }[];
          toast.push({
            tone: 'success',
            title: `Added ${created.length} source${created.length === 1 ? '' : 's'}`,
            description: 'They will be ready to search in a moment.',
          });
          await onAdded();
          onClose();
        } else {
          const error = (await response.json()) as { error?: string };
          toast.push({
            tone: 'error',
            title: 'Upload failed',
            description: error.error,
          });
        }
      } catch {
        toast.push({ tone: 'error', title: 'Upload failed' });
      } finally {
        setBusy(false);
      }
    },
    [notebookId, onAdded, onClose, toast],
  );

  const submitUrl = useCallback(async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/notebooks/${notebookId}/sources/web`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
        },
      );
      if (response.ok) {
        toast.push({ tone: 'success', title: 'Website added' });
        await onAdded();
        onClose();
      } else {
        const error = (await response.json()) as { error?: string };
        toast.push({
          tone: 'error',
          title: 'Could not read that page',
          description: error.error,
        });
      }
    } finally {
      setBusy(false);
    }
  }, [notebookId, url, onAdded, onClose, toast]);

  const submitText = useCallback(async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/notebooks/${notebookId}/sources/text`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: textTitle.trim() || 'Copied text',
            text,
          }),
        },
      );
      if (response.ok) {
        toast.push({ tone: 'success', title: 'Text added' });
        setText('');
        setTextTitle('');
        await onAdded();
        onClose();
      } else {
        const error = (await response.json()) as { error?: string };
        toast.push({
          tone: 'error',
          title: 'Could not add that text',
          description: error.error,
        });
      }
    } finally {
      setBusy(false);
    }
  }, [notebookId, text, textTitle, onAdded, onClose, toast]);

  const submitYouTube = useCallback(async () => {
    if (!youtubeUrl.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/notebooks/${notebookId}/sources/youtube`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: youtubeUrl.trim() }),
        },
      );
      if (response.ok) {
        toast.push({ tone: 'success', title: 'Video added' });
        setYoutubeUrl('');
        await onAdded();
        onClose();
      } else {
        const error = (await response.json()) as { error?: string };
        toast.push({
          tone: 'error',
          title: 'Could not import that video',
          description: error.error,
        });
      }
    } finally {
      setBusy(false);
    }
  }, [notebookId, youtubeUrl, onAdded, onClose, toast]);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'upload', label: 'Upload Files', icon: 'upload_file' },
    { id: 'website', label: 'Websites', icon: 'language' },
    { id: 'drive', label: 'Drive', icon: 'drive_file_move' },
    { id: 'text', label: 'Copied text', icon: 'content_copy' },
    { id: 'youtube', label: 'YouTube', icon: 'smart_display' },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add sources to start researching"
      description="Bring in documents, websites, videos or plain text. There is no limit on how many sources you add."
      width="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[13px] transition',
                tab === item.id
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-hairline bg-surface-2 text-neutral-300 hover:border-hairline-strong hover:bg-surface-3',
              )}
            >
              <span className="material-symbols-rounded text-[16px]" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'upload' ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void uploadFiles(Array.from(event.dataTransfer.files));
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl',
              'border-2 border-dashed px-6 py-10 text-center transition',
              dragging
                ? 'border-accent bg-accent/10'
                : 'border-hairline-strong bg-surface-2 hover:border-accent/50',
            )}
          >
            <span className="material-symbols-rounded text-[26px] text-neutral-500">
              cloud_upload
            </span>
            <p className="text-sm font-medium text-neutral-200">
              or drop your files
            </p>
            <p className="text-[12px] text-neutral-500">
              Any file type, up to 1 TB — pdf, docs, slides, spreadsheets,
              images, audio, archives, and more
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                void uploadFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
          </div>
        ) : null}

        {tab === 'website' ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitUrl();
              }}
              placeholder="https://example.com/article"
              className="field"
            />
            <div className="flex justify-end">
              <Button
                variant="primary"
                loading={busy}
                disabled={!url.trim()}
                onClick={() => void submitUrl()}
              >
                Add website
              </Button>
            </div>
          </div>
        ) : null}

        {tab === 'drive' ? (
          <div className="rounded-xl border border-hairline bg-surface-2 p-4 text-center">
            <span className="material-symbols-rounded text-[26px] text-neutral-500">
              drive_file_move
            </span>
            <p className="mt-2 text-sm text-neutral-300">
              Import files from Google Drive
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-neutral-500">
              Connect a Google account in Settings to browse Drive and import
              files. Drive documents stay in sync — FreeLM re-reads them when
              they change.
            </p>
            <Button
              className="mt-3"
              icon="settings"
              onClick={() => {
                window.location.href = '/app/settings';
              }}
            >
              Open settings
            </Button>
          </div>
        ) : null}

        {tab === 'text' ? (
          <div className="space-y-2">
            <input
              value={textTitle}
              onChange={(event) => setTextTitle(event.target.value)}
              placeholder="Title (optional)"
              className="field"
            />
            <textarea
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              placeholder="Paste any text here to use it as a source"
              className="field resize-none font-mono text-[13px]"
            />
            <div className="flex justify-end">
              <Button
                variant="primary"
                loading={busy}
                disabled={!text.trim()}
                onClick={() => void submitText()}
              >
                Add text
              </Button>
            </div>
          </div>
        ) : null}

        {tab === 'youtube' ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitYouTube();
              }}
              placeholder="https://www.youtube.com/watch?v=…"
              className="field"
            />
            <p className="text-[12px] text-neutral-500">
              Only the video transcript is imported. Public videos with captions
              work best.
            </p>
            <div className="flex justify-end">
              <Button
                variant="primary"
                loading={busy}
                disabled={!youtubeUrl.trim()}
                onClick={() => void submitYouTube()}
              >
                Add video
              </Button>
            </div>
          </div>
        ) : null}

        {busy ? (
          <p className="flex items-center gap-2 text-[12px] text-neutral-500">
            <Spinner size={12} /> Working…
          </p>
        ) : null}

        <p className="flex items-center gap-2 border-t border-hairline pt-3 text-[12px] text-neutral-500">
          <span className="material-symbols-rounded text-[16px] text-success">
            all_inclusive
          </span>
          Unlimited: no limit on the number of sources, their size, or their
          length. Every Studio tool is free and unlocked.
        </p>
      </div>
    </Modal>
  );
}
