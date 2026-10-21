'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Notebook } from '@freelm/shared';

import { NotebookCard } from '@/components/notebooks/NotebookCard';
import { NotebookSubNav, TopNav } from '@/components/shell/TopNav';
import { EmojiIconPicker } from '@/components/ui/EmojiIconPicker';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Dropdown } from '@/components/ui/Dropdown';
import {
  Button,
  cn,
  IconButton,
  Spinner,
  useToast,
} from '@/components/ui/primitives';

type Scope = 'all' | 'mine' | 'featured';
type Sort = 'recent' | 'title' | 'sources';
type View = 'grid' | 'list';

export default function NotebooksPage() {
  const router = useRouter();
  const toast = useToast();

  const [scope, setScope] = useState<Scope>('mine');
  const [sort, setSort] = useState<Sort>('recent');
  const [view, setView] = useState<View>('grid');
  const [search, setSearch] = useState('');
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Notebook | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope, sort });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/notebooks?${params.toString()}`);
      if (response.ok) {
        setNotebooks((await response.json()) as Notebook[]);
      }
    } catch {
      toast.push({
        tone: 'error',
        title: 'Could not load your notebooks',
        description: 'Check that the server is running and try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [scope, sort, search, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const sorted = useMemo(() => {
    const list = [...notebooks];
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'sources') list.sort((a, b) => b.sourceCount - a.sourceCount);
    if (sort === 'recent') {
      list.sort(
        (a, b) =>
          Number(b.isPinned) - Number(a.isPinned) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }
    return list;
  }, [notebooks, sort]);

  const handleDelete = async (notebook: Notebook) => {
    setPendingDelete(notebook);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const response = await fetch(`/api/notebooks/${pendingDelete.id}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      setNotebooks((current) =>
        current.filter((item) => item.id !== pendingDelete.id),
      );
      toast.push({ tone: 'success', title: 'Notebook deleted' });
    } else {
      toast.push({
        tone: 'error',
        title: 'Could not delete that notebook',
      });
    }
    setPendingDelete(null);
  };

  const handleRename = async (notebook: Notebook, title: string) => {
    const response = await fetch(`/api/notebooks/${notebook.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (response.ok) {
      setNotebooks((current) =>
        current.map((item) => (item.id === notebook.id ? { ...item, title } : item)),
      );
    }
  };

  const handleTogglePin = async (notebook: Notebook) => {
    const isPinned = !notebook.isPinned;
    const response = await fetch(`/api/notebooks/${notebook.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPinned }),
    });
    if (response.ok) {
      setNotebooks((current) =>
        current.map((item) =>
          item.id === notebook.id ? { ...item, isPinned } : item,
        ),
      );
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <TopNav
        subnav={<NotebookSubNav scope={scope} onChange={setScope} />}
        right={
          <>
            <div className="hidden lg:block">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notebooks"
                className="field h-9 w-56 py-0"
              />
            </div>
            <div className="hidden items-center gap-1 sm:flex">
              <IconButton
                icon="grid_view"
                label="Grid view"
                active={view === 'grid'}
                onClick={() => setView('grid')}
              />
              <IconButton
                icon="view_list"
                label="List view"
                active={view === 'list'}
                onClick={() => setView('list')}
              />
            </div>
            <Dropdown
              label="Sort notebooks"
              align="end"
              trigger={
                <span className="pill">
                  <span className="material-symbols-rounded text-[18px]" aria-hidden>
                    sort
                  </span>
                  <span className="hidden sm:inline">
                    {sort === 'recent'
                      ? 'Most recent'
                      : sort === 'title'
                        ? 'Title'
                        : 'Sources'}
                  </span>
                </span>
              }
              items={[
                {
                  id: 'recent',
                  label: 'Most recent',
                  icon: 'schedule',
                  onSelect: () => setSort('recent'),
                },
                {
                  id: 'title',
                  label: 'Title',
                  icon: 'sort_by_alpha',
                  onSelect: () => setSort('title'),
                },
                {
                  id: 'sources',
                  label: 'Most sources',
                  icon: 'library_books',
                  onSelect: () => setSort('sources'),
                },
              ]}
            />
            <Button
              variant="primary"
              icon="add"
              onClick={() => setCreating(true)}
              className="hidden sm:inline-flex"
            >
              Create new
            </Button>
            <IconButton
              icon="add"
              label="Create new notebook"
              onClick={() => setCreating(true)}
              className="sm:hidden"
            />
          </>
        }
      />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-5 text-2xl font-semibold tracking-tight text-neutral-50">
          {scope === 'featured'
            ? 'Featured notebooks'
            : scope === 'all'
              ? 'All notebooks'
              : 'My notebooks'}
        </h1>

        {loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-neutral-500">
            <Spinner /> Loading notebooks…
          </div>
        ) : (
          <div
            className={cn(
              view === 'grid'
                ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'flex flex-col gap-2',
            )}
          >
            {/* The "Create new notebook" tile, first in the grid. */}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-panel border border-hairline',
                'bg-surface text-center transition hover:border-hairline-strong hover:shadow-glow',
                view === 'grid' ? 'h-[176px]' : 'flex-row justify-start px-4 py-3',
              )}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-glow-accent">
                <span className="material-symbols-rounded text-[24px]" aria-hidden>
                  add
                </span>
              </span>
              <span className="text-sm font-medium text-neutral-200">
                Create new notebook
              </span>
            </button>

            {sorted.map((notebook) =>
              view === 'grid' ? (
                <NotebookCard
                  key={notebook.id}
                  notebook={notebook}
                  onDelete={handleDelete}
                  onRename={handleRename}
                  onTogglePin={handleTogglePin}
                />
              ) : (
                <NotebookRow
                  key={notebook.id}
                  notebook={notebook}
                  onDelete={handleDelete}
                  onRename={handleRename}
                  onTogglePin={handleTogglePin}
                />
              ),
            )}
          </div>
        )}

        {!loading && sorted.length === 0 ? (
          <p className="mt-6 text-sm text-neutral-500">
            {scope === 'featured'
              ? 'No featured notebooks yet.'
              : 'No notebooks yet — create one to get started.'}
          </p>
        ) : null}
      </main>

      <CreateNotebookModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(notebook) => {
          setCreating(false);
          router.push(`/app/notebooks/${notebook.id}`);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete this notebook?"
        message={
          <>
            Deleting <strong>{pendingDelete?.title}</strong> also removes its
            sources, chats and Studio outputs. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

function NotebookRow({
  notebook,
  onDelete,
  onRename,
  onTogglePin,
}: {
  notebook: Notebook;
  onDelete: (notebook: Notebook) => void;
  onRename: (notebook: Notebook, title: string) => void;
  onTogglePin: (notebook: Notebook) => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 transition hover:border-hairline-strong">
      <span className="text-xl" aria-hidden>
        {notebook.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-100">
          {notebook.title}
        </p>
        {notebook.description ? (
          <p className="truncate text-[12px] text-neutral-500">
            {notebook.description}
          </p>
        ) : null}
      </div>
      <span className="text-[12px] text-neutral-500">
        {notebook.sourceCount} sources
      </span>
      <Dropdown
        align="end"
        label="Notebook options"
        trigger={
          <span className="icon-button opacity-0 transition group-hover:opacity-100">
            <span className="material-symbols-rounded text-[18px]" aria-hidden>
              more_vert
            </span>
          </span>
        }
        items={[
          {
            id: 'pin',
            label: notebook.isPinned ? 'Unpin notebook' : 'Pin notebook',
            icon: notebook.isPinned ? 'keep_off' : 'keep',
            onSelect: () => onTogglePin(notebook),
          },
          {
            id: 'rename',
            label: 'Rename',
            icon: 'edit',
            onSelect: () => {
              const next = window.prompt('Notebook title', notebook.title);
              if (next?.trim()) onRename(notebook, next.trim());
            },
          },
          {
            id: 'delete',
            label: 'Delete',
            icon: 'delete',
            destructive: true,
            onSelect: () => onDelete(notebook),
          },
        ]}
      />
    </div>
  );
}

function CreateNotebookModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (notebook: Notebook) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📓');
  const [pickingIcon, setPickingIcon] = useState(false);
  const [kind, setKind] = useState<'regular' | 'study'>('regular');
  const [learningGoal, setLearningGoal] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setIcon('📓');
      setKind('regular');
      setLearningGoal('');
    }
  }, [open]);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const response = await fetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          icon,
          kind,
          ...(kind === 'study' && learningGoal.trim()
            ? { learningGoal: learningGoal.trim() }
            : {}),
        }),
      });
      if (response.ok) {
        onCreated((await response.json()) as Notebook);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create notebook"
      description="Give it a name and an icon. You can change both later."
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!title.trim()}
            onClick={() => void submit()}
          >
            Create notebook
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-300">
            Title
          </label>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
            placeholder="e.g. WP Certification Prep"
            className="field"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-300">
            Description <span className="text-neutral-600">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder="What is this notebook for?"
            className="field resize-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-300">
            Icon
          </label>
          <button
            type="button"
            onClick={() => setPickingIcon(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-surface-2 px-3 py-2.5 text-left transition hover:border-hairline-strong"
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-3 text-2xl"
              aria-hidden
            >
              {icon}
            </span>
            <span className="flex-1">
              <span className="block text-[13px] text-neutral-200">
                {icon} {icon}
              </span>
              <span className="block text-[12px] text-neutral-500">
                Tap to pick from your device’s emoji keyboard
              </span>
            </span>
            <span className="material-symbols-rounded text-[20px] text-neutral-500">
              emoji_emotions
            </span>
          </button>
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-300">
            Type
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind('regular')}
              className={cn(
                'flex-1 rounded-xl border px-3 py-2.5 text-left transition',
                kind === 'regular'
                  ? 'border-accent bg-accent/10'
                  : 'border-hairline bg-surface-2 hover:border-hairline-strong',
              )}
            >
              <span className="block text-[13px] font-medium text-neutral-100">
                Regular
              </span>
              <span className="block text-[12px] text-neutral-500">
                Research, notes and studio outputs
              </span>
            </button>
            <button
              type="button"
              onClick={() => setKind('study')}
              className={cn(
                'flex-1 rounded-xl border px-3 py-2.5 text-left transition',
                kind === 'study'
                  ? 'border-accent bg-accent/10'
                  : 'border-hairline bg-surface-2 hover:border-hairline-strong',
              )}
            >
              <span className="block text-[13px] font-medium text-neutral-100">
                Study
              </span>
              <span className="block text-[12px] text-neutral-500">
                Personalised lessons built around a goal
              </span>
            </button>
          </div>
        </div>

        {kind === 'study' ? (
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-neutral-300">
              Learning goal
            </label>
            <input
              value={learningGoal}
              onChange={(event) => setLearningGoal(event.target.value)}
              placeholder="e.g. Pass the WCE certification exam"
              className="field"
            />
          </div>
        ) : null}
      </div>

      <EmojiIconPicker
        open={pickingIcon}
        value={icon}
        onClose={() => setPickingIcon(false)}
        onChange={setIcon}
      />
    </Modal>
  );
}
