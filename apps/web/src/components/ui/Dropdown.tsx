'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { usePresence } from '@/hooks/usePresence';
import { cn } from './primitives';

// ---------------------------------------------------------------------------
// Dropdown menu
// ---------------------------------------------------------------------------

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  className?: string;
  label?: string;
}

export function Dropdown({
  trigger,
  items,
  align = 'end',
  className,
  label,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const { mounted, state } = usePresence(open, 150);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex press"
      >
        {trigger}
      </button>
      {mounted ? (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-1 min-w-[11rem] overflow-hidden rounded-xl',
            'border border-hairline bg-surface-2 py-1 shadow-panel',
            align === 'end' ? 'right-0' : 'left-0',
            state === 'enter' ? 'anim-pop-in' : 'anim-pop-out',
            className,
          )}
        >
          {items.map((item) => (
            <div key={item.id}>
              {item.separatorBefore ? (
                <div className="my-1 h-px bg-hairline" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition',
                  'duration-[--duration-micro]',
                  item.disabled
                    ? 'cursor-not-allowed text-neutral-600'
                    : item.destructive
                      ? 'text-danger hover:bg-danger/10'
                      : 'text-neutral-200 hover:bg-surface-3',
                )}
              >
                {item.icon ? (
                  <span className="material-symbols-rounded text-[18px]" aria-hidden>
                    {item.icon}
                  </span>
                ) : null}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Popover
// ---------------------------------------------------------------------------

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end' | 'center';
  className?: string;
  label?: string;
  panelWidth?: string;
}

export function Popover({
  trigger,
  children,
  align = 'start',
  className,
  label,
  panelWidth = 'w-80',
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const { mounted, state } = usePresence(open, 150);
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  const alignment = {
    start: 'left-0',
    end: 'right-0',
    center: 'left-1/2 -translate-x-1/2',
  } as const;

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex press"
      >
        {trigger}
      </button>
      {mounted ? (
        <div
          id={id}
          role="dialog"
          className={cn(
            'absolute top-full z-50 mt-2 rounded-xl border border-hairline',
            'bg-surface-2 p-3 shadow-panel',
            alignment[align],
            panelWidth,
            state === 'enter' ? 'anim-pop-in' : 'anim-pop-out',
            className,
          )}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}
