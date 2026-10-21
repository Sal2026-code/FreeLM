'use client';

import { useEffect, useRef, useState } from 'react';

export type PresenceState = 'enter' | 'exit';

/**
 * Keep an element mounted while it animates out.
 *
 * React removes an element the instant its parent stops rendering it, which
 * would cut the exit animation short. `usePresence` keeps it in the tree for
 * the length of the exit transition and reports which phase it is in so the
 * component can pick the right keyframes.
 */
export function usePresence(
  open: boolean,
  exitDuration = 200,
): { mounted: boolean; state: PresenceState } {
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState<PresenceState>(open ? 'enter' : 'exit');
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Wait a frame so the browser has the "exit" styles applied before
      // switching to the "enter" styles — otherwise there is no transition.
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => setState('enter'));
      });
      return () => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
      };
    }

    setState('exit');
    const timer = window.setTimeout(() => setMounted(false), exitDuration);
    return () => window.clearTimeout(timer);
  }, [open, exitDuration]);

  return { mounted, state };
}
