'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { Dropdown } from '@/components/ui/Dropdown';
import { cn, IconButton, Tooltip } from '@/components/ui/primitives';

/** The FreeLM mark: a rounded square with a stylised notebook glyph. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#7c4dff] text-white shadow-glow-accent"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="material-symbols-rounded"
        style={{ fontSize: Math.round(size * 0.6) }}
      >
        menu_book
      </span>
    </span>
  );
}

export interface TopNavProps {
  /**
   * `list` — the notebooks picker: brand row, then a sub-navigation row with
   * the All / My notebooks / Featured notebooks pills on the left and the
   * search, view toggle, sort and "Create new" controls on the right.
   *
   * `workspace` — inside a notebook: the notebook emoji and title on the
   * left, and Create notebook / Share / Settings / apps / account on the
   * right.
   */
  variant?: 'list' | 'workspace';
  subnav?: ReactNode;
  notebookTitle?: string;
  notebookIcon?: string;
  /** Opens the device emoji picker so the notebook icon can be changed. */
  onEditIcon?: () => void;
  /** Extra controls rendered on the right of the list screen. */
  listActions?: ReactNode;
  /** Extra controls rendered on the right of the workspace screen. */
  workspaceActions?: ReactNode;
  onShare?: () => void;
  /**
   * When provided, the search icon expands an inline field bound to these.
   * This mirrors the reference layout: a search icon that opens a field.
   */
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
}

export function TopNav({
  variant = 'list',
  subnav,
  notebookTitle,
  notebookIcon,
  onEditIcon,
  listActions,
  workspaceActions,
  onShare,
  searchValue,
  onSearchValueChange,
  searchPlaceholder = 'Search',
  children,
}: TopNavProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur-xl">
      {/* Row 1 — brand and account */}
      <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
        <Link
          href="/app"
          className="flex shrink-0 items-center gap-2.5 rounded-pill py-1 pr-2 transition hover:bg-surface-2"
        >
          <BrandMark />
          <span className="hidden text-[15px] font-semibold tracking-tight text-neutral-50 sm:inline">
            FreeLM
          </span>
        </Link>

        {variant === 'workspace' && notebookTitle ? (
          <>
            <span className="hidden h-5 w-px bg-hairline sm:block" />
            <div className="flex min-w-0 items-center gap-2 rounded-pill px-2 py-1">
              {onEditIcon ? (
                <button
                  type="button"
                  onClick={onEditIcon}
                  title="Change the notebook icon"
                  aria-label="Change the notebook icon"
                  className="rounded-full p-0.5 text-lg leading-none transition hover:bg-surface-2"
                >
                  <span aria-hidden>{notebookIcon ?? '📓'}</span>
                </button>
              ) : (
                <span className="text-base leading-none" aria-hidden>
                  {notebookIcon ?? '📓'}
                </span>
              )}
              <Link
                href="/app"
                className="min-w-0 truncate text-[14px] font-medium text-neutral-200"
              >
                {notebookTitle}
              </Link>
            </div>
          </>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          {variant === 'workspace' ? (
            <>
              <Link href="/app" className="hidden sm:inline-flex">
                <span className="pill bg-neutral-100 text-neutral-900 hover:bg-white">
                  <span className="material-symbols-rounded text-[18px]" aria-hidden>
                    add
                  </span>
                  Create notebook
                </span>
              </Link>
              {onShare ? (
                <button type="button" onClick={onShare} className="pill hidden sm:inline-flex">
                  <span className="material-symbols-rounded text-[18px]" aria-hidden>
                    share
                  </span>
                  <span className="hidden md:inline">Share</span>
                </button>
              ) : null}
              {workspaceActions}
              <Link href="/app/settings" className="hidden sm:block">
                <span className="pill">
                  <span className="material-symbols-rounded text-[18px]" aria-hidden>
                    settings
                  </span>
                  <span className="hidden md:inline">Settings</span>
                </span>
              </Link>
              <IconButton icon="apps" label="Apps" className="hidden sm:inline-flex" />
              <AccountMenu />
            </>
          ) : (
            <>
              <Link href="/app/settings" className="hidden sm:block">
                <span className="pill">
                  <span className="material-symbols-rounded text-[18px]" aria-hidden>
                    settings
                  </span>
                  <span className="hidden md:inline">Settings</span>
                </span>
              </Link>
              <AccountMenu />
            </>
          )}
        </div>
      </div>

      {/* Row 2 — sub-navigation and list controls */}
      {variant === 'list' ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2 sm:px-4">
          {subnav}
          <div className="ml-auto flex items-center gap-1.5">
            <Tooltip label="Search">
              <IconButton
                icon="search"
                label="Search"
                onClick={() => setSearchOpen((value) => !value)}
                active={searchOpen}
              />
            </Tooltip>
            {searchOpen && onSearchValueChange ? (
              <input
                autoFocus
                value={searchValue ?? ''}
                onChange={(event) => onSearchValueChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="field h-9 w-56 py-0"
              />
            ) : null}
            {listActions}
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="border-t border-hairline px-3 py-2 sm:px-4">
          <GlobalSearch onClose={() => setSearchOpen(false)} />
        </div>
      ) : null}

      {children}
    </header>
  );
}

function AccountMenu() {
  return (
    <Dropdown
      align="end"
      label="Account"
      trigger={
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#f6a3b5] to-[#c58af9] text-[13px] font-semibold text-white ring-1 ring-white/10">
          FL
        </span>
      }
      items={[
        {
          id: 'guest',
          label: 'Guest session',
          icon: 'person',
        },
        {
          id: 'signin',
          label: 'Sign in with Google',
          icon: 'login',
          onSelect: () => {
            window.location.href = '/api/auth/signin/google';
          },
        },
        {
          id: 'settings',
          label: 'Settings',
          icon: 'settings',
          onSelect: () => {
            window.location.href = '/app/settings';
          },
        },
      ]}
    />
  );
}

/** The All / My notebooks / Featured notebooks sub-navigation. */
export function NotebookSubNav({
  scope,
  onChange,
}: {
  scope: 'all' | 'mine' | 'featured';
  onChange: (scope: 'all' | 'mine' | 'featured') => void;
}) {
  const options: { value: 'all' | 'mine' | 'featured'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'mine', label: 'My notebooks' },
    { value: 'featured', label: 'Featured notebooks' },
  ];

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'whitespace-nowrap rounded-pill px-3 py-1.5 text-[13px] font-medium transition',
            scope === option.value
              ? 'bg-surface-3 text-neutral-50'
              : 'text-neutral-500 hover:text-neutral-300',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    { id: string; title: string; icon: string; type: string }[]
  >([]);
  const [loading, setLoading] = useState(false);

  async function runSearch(value: string) {
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(value.trim())}`,
      );
      if (response.ok) {
        const data = (await response.json()) as {
          results: { id: string; title: string; icon: string; type: string }[];
        };
        setResults(data.results);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative">
        <span className="material-symbols-rounded pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-neutral-500">
          search
        </span>
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            void runSearch(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
          }}
          placeholder="Search notebooks, sources and notes"
          className="field pl-10 pr-10"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="icon-button absolute right-2 top-1/2 -translate-y-1/2"
        >
          <span className="material-symbols-rounded text-[18px]" aria-hidden>
            close
          </span>
        </button>
      </div>

      {loading ? (
        <p className="mt-3 text-[13px] text-neutral-500">Searching…</p>
      ) : results.length > 0 ? (
        <ul className="mt-2 overflow-hidden rounded-xl border border-hairline bg-surface-2">
          {results.map((result) => (
            <li key={`${result.type}-${result.id}`}>
              <Link
                href={`/app/notebooks/${result.id}`}
                onClick={onClose}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-200 transition hover:bg-surface-3"
              >
                <span className="text-base" aria-hidden>
                  {result.icon}
                </span>
                <span className="truncate">{result.title}</span>
                <span className="ml-auto text-[11px] uppercase tracking-wide text-neutral-500">
                  {result.type}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 ? (
        <p className="mt-3 text-[13px] text-neutral-500">No matches.</p>
      ) : null}
    </div>
  );
}
