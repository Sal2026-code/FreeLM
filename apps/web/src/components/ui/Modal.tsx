'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { usePresence } from '@/hooks/usePresence';
import { cn } from './primitives';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Tailwind max-width class. */
  width?: string;
  /** Disable closing on backdrop click. */
  persistent?: boolean;
}

/**
 * A centered, dark modal — the pattern used by every "Customize …" dialog.
 *
 * The panel scales and fades in, and animates back out on close, so the
 * dismissal reads as a reversal rather than a cut.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-2xl',
  persistent,
}: ModalProps) {
  const { mounted, state } = usePresence(open, 200);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !persistent) onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, persistent]);

  if (!mounted || typeof document === 'undefined') return null;

  const entering = state === 'enter';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={() => (persistent ? undefined : onClose())}
        className={cn(
          'fixed inset-0 cursor-default bg-black/70 backdrop-blur-sm',
          entering ? 'anim-fade-in' : 'anim-fade-out',
        )}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'relative z-10 my-auto w-full rounded-panel border border-hairline',
          'bg-surface shadow-panel outline-none',
          entering ? 'anim-scale-in' : 'anim-scale-out',
          width,
        )}
      >
        {title ? (
          <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[17px] font-semibold text-neutral-50">
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-[13px] text-neutral-400">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="icon-button press -mr-1 -mt-1"
            >
              <span className="material-symbols-rounded text-[20px]" aria-hidden>
                close
              </span>
            </button>
          </header>
        ) : null}

        <div className="px-5 py-4">{children}</div>

        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-3.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A small centred dialog used for confirmations and short prompts.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="press inline-flex h-9 items-center rounded-pill border border-hairline bg-surface-2 px-4 text-sm text-neutral-200 transition hover:bg-surface-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={cn(
              'press inline-flex h-9 items-center rounded-pill px-4 text-sm font-medium text-white transition',
              destructive
                ? 'bg-danger/80 hover:bg-danger'
                : 'bg-accent hover:bg-accent-hover',
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm leading-6 text-neutral-300">{message}</div>
    </Modal>
  );
}
