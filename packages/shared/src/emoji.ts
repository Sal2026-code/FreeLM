/**
 * FreeLM — emoji handling.
 *
 * The notebook icon is a **native device emoji**: the user picks it from the
 * operating system's own emoji keyboard (the globe key on iOS/macOS, the
 * smiley key on Android, `Win` + `.` on Windows 11), so any emoji the device
 * supports is available — including ones that did not exist when this app
 * was written.
 */

/** U+FE0F VARIATION SELECTOR-16. */
const VS16 = '\uFE0F';
/** U+200D ZERO WIDTH JOINER. */
const ZWJ = '\u200D';
/** Skin tone modifiers, U+1F3FB – U+1F3FF. */
const SKIN_TONES = '\u{1F3FB}-\u{1F3FF}';

const BASE = `(?:\\p{Extended_Pictographic}|\\p{Emoji_Presentation})`;
const MODIFIER = `(?:${VS16}|[${SKIN_TONES}])?`;

const EMOJI_SEQUENCE = new RegExp(
  `^${BASE}${MODIFIER}(?:${ZWJ}${BASE}${MODIFIER})*$`,
  'u',
);

/** True when the string is a single (possibly compound) emoji. */
export function isEmoji(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Allow regional-indicator pairs (flags) which are two code points.
  if (/^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(trimmed)) return true;
  return EMOJI_SEQUENCE.test(trimmed);
}

/** Keep only the first emoji in a string (ignores surrounding whitespace). */
export function extractEmoji(value: string): string | null {
  const trimmed = value.trim();
  if (isEmoji(trimmed)) return trimmed;

  // Fall back to the first emoji-like grapheme in the string.
  const match = trimmed.match(
    /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:[\u{1F3FB}-\u{1F3FF}])?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:[\u{1F3FB}-\u{1F3FF}])?)*/u,
  );
  return match?.[0] ?? null;
}

/**
 * Platform-specific instructions for opening the system emoji picker.
 */
export function emojiPickerHint(platform: string): string {
  if (platform === 'mac' || platform === 'ios') {
    return 'Press the globe key 🌐, or Control + Command + Space, to open the system emoji picker.';
  }
  if (platform === 'win' || platform === 'android') {
    return 'Tap the emoji key 😊 on your keyboard, or press Win + . on Windows.';
  }
  return 'Use the emoji key on your keyboard, or paste an emoji here.';
}

/**
 * A small set of frequently used notebook icons, offered as a shortcut
 * alongside the system picker.
 */
export const FREQUENT_NOTEBOOK_EMOJIS = [
  '📓',
  '📔',
  '📒',
  '📚',
  '📖',
  '🗂️',
  '📁',
  '🧠',
  '💡',
  '🔬',
  '🧪',
  '📊',
  '📈',
  '🎯',
  '🚀',
  '⚙️',
  '🛠️',
  '🧭',
  '🔭',
  '🧬',
  '🌱',
  '⚖️',
  '🏛️',
  '🎨',
  '🎵',
  '⚽',
  '🍳',
  '💻',
  '📷',
  '🗺️',
] as const;

/** Platform detection for the hint text. */
export function detectPlatform(): 'mac' | 'ios' | 'win' | 'android' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const source = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  if (/iPad|iPhone|iPod/.test(source)) return 'ios';
  if (/Mac/i.test(source)) return 'mac';
  if (/Win/i.test(source)) return 'win';
  if (/Android/i.test(source)) return 'android';
  return 'other';
}
