'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PaneWidths {
  sources: number;
  chat: number;
  studio: number;
}

export const DEFAULT_WIDTHS: PaneWidths = {
  sources: 280,
  chat: 720,
  studio: 320,
};

export const MIN_WIDTHS = {
  sources: 260,
  chat: 360,
  studio: 260,
} as const;

const STORAGE_KEY = 'freelm.paneWidths.v1';

/**
 * Resizable pane widths with localStorage persistence.
 *
 * The server renders the default widths; the stored widths are applied in a
 * layout effect so there is no hydration mismatch and no visible jump.
 */
export function useResizablePanes(options?: {
  defaultWidths?: PaneWidths;
  onChange?: (widths: PaneWidths) => void;
}) {
  const defaults = options?.defaultWidths ?? DEFAULT_WIDTHS;
  const [widths, setWidths] = useState<PaneWidths>(defaults);
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<
    { pane: 'sources' | 'studio'; startX: number; startWidth: number } | null
  >(null);

  // Restore persisted widths after mount (client only).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PaneWidths>;
        setWidths((current) => ({
          sources: clamp(parsed.sources ?? current.sources, MIN_WIDTHS.sources),
          chat: clamp(parsed.chat ?? current.chat, MIN_WIDTHS.chat),
          studio: clamp(parsed.studio ?? current.studio, MIN_WIDTHS.studio),
        }));
      }
    } catch {
      /* ignore malformed storage */
    }
    setReady(true);
  }, []);

  const persist = useCallback(
    (next: PaneWidths) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage may be unavailable */
      }
      options?.onChange?.(next);
    },
    [options],
  );

  const update = useCallback(
    (patch: Partial<PaneWidths>) => {
      setWidths((current) => {
        const next = { ...current, ...patch };
        return {
          sources: clamp(next.sources, MIN_WIDTHS.sources),
          chat: clamp(next.chat, MIN_WIDTHS.chat),
          studio: clamp(next.studio, MIN_WIDTHS.studio),
        };
      });
    },
    [],
  );

  const startDragging = useCallback(
    (pane: 'sources' | 'studio', event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const startWidth =
        pane === 'sources' ? widths.sources : widths.studio;

      draggingRef.current = {
        pane,
        startX: event.clientX,
        startWidth,
      };

      const onMove = (moveEvent: PointerEvent) => {
        const drag = draggingRef.current;
        if (!drag) return;
        const delta = moveEvent.clientX - drag.startX;

        setWidths((current) => {
          const total = rect.width;
          const other = drag.pane === 'sources' ? current.studio : current.sources;
          const maxWidth = Math.max(
            MIN_WIDTHS[drag.pane],
            total - other - MIN_WIDTHS.chat,
          );

          if (drag.pane === 'sources') {
            const sources = clamp(
              drag.startWidth + delta,
              MIN_WIDTHS.sources,
              maxWidth,
            );
            return {
              ...current,
              sources,
              chat: Math.max(current.chat, total - sources - current.studio),
            };
          }

          const studio = clamp(
            drag.startWidth - delta,
            MIN_WIDTHS.studio,
            maxWidth,
          );
          return {
            ...current,
            studio,
            chat: Math.max(current.chat, total - current.sources - studio),
          };
        });
      };

      const onUp = () => {
        draggingRef.current = null;
        document.body.classList.remove('dragging-col-resize');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        setWidths((current) => {
          persist(current);
          return current;
        });
      };

      document.body.classList.add('dragging-col-resize');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [widths, persist],
  );

  const reset = useCallback(() => {
    setWidths(defaults);
    persist(defaults);
  }, [defaults, persist]);

  // Keep the chat pane usable on narrow viewports.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const total = container.getBoundingClientRect().width;
      setWidths((current) => {
        if (total <= 0) return current;
        if (total < 900) {
          // Stack: give the chat pane whatever is left.
          return { ...current, chat: Math.max(current.chat, MIN_WIDTHS.chat) };
        }
        return current;
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return {
    widths,
    setWidths,
    update,
    reset,
    ready,
    containerRef,
    startDragging,
    persist,
  };
}

function clamp(value: number, min: number, max?: number): number {
  if (!Number.isFinite(value)) return min;
  const lower = Math.max(min, Math.round(value));
  if (max === undefined) return lower;
  return Math.max(min, Math.min(lower, Math.round(max)));
}
