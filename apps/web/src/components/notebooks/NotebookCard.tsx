'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { Notebook } from '@freelm/shared';

import { Dropdown } from '@/components/ui/Dropdown';
import { cn } from '@/components/ui/primitives';

export interface NotebookCardProps {
  notebook: Notebook;
  onDelete?: (notebook: Notebook) => void;
  onRename?: (notebook: Notebook, title: string) => void;
  onTogglePin?: (notebook: Notebook) => void;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function NotebookCard({
  notebook,
  onDelete,
  onRename,
  onTogglePin,
}: NotebookCardProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(notebook.title);

  const menuItems = [
    ...(onTogglePin
      ? [
          {
            id: 'pin',
            label: notebook.isPinned ? 'Unpin notebook' : 'Pin notebook',
            icon: notebook.isPinned ? 'keep_off' : 'keep',
            onSelect: () => onTogglePin(notebook),
          },
        ]
      : []),
    ...(onRename
      ? [
          {
            id: 'rename',
            label: 'Rename',
            icon: 'edit',
            onSelect: () => setEditing(true),
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            id: 'delete',
            label: 'Delete',
            icon: 'delete',
            destructive: true,
            onSelect: () => onDelete(notebook),
          },
        ]
      : []),
  ];

  return (
    <div className="group relative flex h-[176px] flex-col justify-between rounded-panel border border-hairline bg-surface p-4 transition hover:border-hairline-strong hover:shadow-glow">
      {menuItems.length > 0 ? (
        <Dropdown
          align="end"
          label="Notebook options"
          trigger={
            <span className="icon-button opacity-0 transition group-hover:opacity-100 focus:opacity-100">
              <span className="material-symbols-rounded text-[18px]" aria-hidden>
                more_vert
              </span>
            </span>
          }
          items={menuItems}
        />
      ) : null}

      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-2xl',
            'ring-1 ring-hairline transition group-hover:ring-hairline-strong',
          )}
          aria-hidden
        >
          {notebook.icon}
        </span>
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              setEditing(false);
              if (title.trim() && title.trim() !== notebook.title) {
                onRename?.(notebook, title.trim());
              } else {
                setTitle(notebook.title);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                setTitle(notebook.title);
                setEditing(false);
              }
            }}
            className="w-full rounded-lg border border-accent/60 bg-surface-2 px-2 py-1 text-center text-sm text-neutral-100 outline-none"
          />
        ) : (
          <Link
            href={`/app/notebooks/${notebook.id}`}
            className="line-clamp-2 w-full text-sm font-medium text-neutral-100 hover:text-white"
          >
            {notebook.title}
          </Link>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px] text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="material-symbols-rounded text-[14px]" aria-hidden>
            description
          </span>
          {notebook.sourceCount}{' '}
          {notebook.sourceCount === 1 ? 'source' : 'sources'}
        </span>
        <span>{relativeTime(notebook.updatedAt)}</span>
      </div>
    </div>
  );
}
