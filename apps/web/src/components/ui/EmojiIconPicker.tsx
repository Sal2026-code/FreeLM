'use client';

import { useEffect, useState } from 'react';

import {
  detectPlatform,
  emojiPickerHint,
  extractEmoji,
  FREQUENT_NOTEBOOK_EMOJIS,
  isEmoji,
} from '@freelm/shared';

import { Modal } from '@/components/ui/Modal';
import { Button, cn, useToast } from '@/components/ui/primitives';

export interface EmojiIconPickerProps {
  open: boolean;
  value: string;
  onClose: () => void;
  onChange: (emoji: string) => void;
}

/**
 * Pick a notebook icon using the **device's own emoji keyboard**.
 *
 * The primary control is a text field: focusing it raises the operating
 * system's emoji keyboard, so every emoji the device knows about is
 * available — including ones released after this app shipped. A grid of
 * frequently used icons is offered as a shortcut.
 */
export function EmojiIconPicker({
  open,
  value,
  onClose,
  onChange,
}: EmojiIconPickerProps) {
  const toast = useToast();
  const [draft, setDraft] = useState(value);
  const [platform, setPlatform] = useState<string>('other');

  useEffect(() => {
    if (open) {
      setDraft(value);
      setPlatform(detectPlatform());
    }
  }, [open, value]);

  const valid = isEmoji(draft);

  function commit() {
    const emoji = extractEmoji(draft);
    if (!emoji) {
      toast.push({
        tone: 'warning',
        title: 'That is not an emoji',
        description: 'Pick one from your keyboard’s emoji panel.',
      });
      return;
    }
    onChange(emoji);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose an icon"
      description="Use your device's emoji keyboard to pick any emoji you like."
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={commit}>
            Use this icon
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* The native emoji field.
            Focusing a text input is what raises the OS emoji keyboard. */}
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-300">
            Emoji
          </label>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(event) => {
                const next = event.target.value;
                // Keep only the last grapheme so the field stays a single emoji.
                const emoji = extractEmoji(next);
                setDraft(emoji ?? next.slice(-2));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commit();
                }
              }}
              placeholder="😀"
              aria-label="Notebook emoji"
              className="field h-14 w-20 text-center text-2xl"
            />
            <p className="flex-1 text-[12px] leading-5 text-neutral-500">
              {emojiPickerHint(platform)}
            </p>
          </div>
          {!valid && draft.length > 0 ? (
            <p className="mt-1.5 text-[12px] text-warning">
              That does not look like an emoji yet.
            </p>
          ) : null}
        </div>

        {/* Shortcut grid */}
        <div>
          <p className="mb-2 text-[12px] font-medium text-neutral-400">
            Frequently used
          </p>
          <div className="grid grid-cols-8 gap-1.5">
            {FREQUENT_NOTEBOOK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setDraft(emoji)}
                className={cn(
                  'flex h-10 items-center justify-center rounded-lg text-xl transition',
                  draft === emoji
                    ? 'bg-accent/20 ring-1 ring-accent'
                    : 'bg-surface-2 hover:bg-surface-3',
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
