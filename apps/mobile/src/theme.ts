/**
 * FreeLM — mobile design tokens.
 *
 * The same dark palette as the web app, so the two feel like one product.
 */

export const colors = {
  canvas: '#0b0b0c',
  surface: '#131315',
  surface2: '#1a1a1d',
  surface3: '#232327',
  hairline: 'rgba(255,255,255,0.10)',
  hairlineStrong: 'rgba(255,255,255,0.20)',
  accent: '#1a73e8',
  accentSoft: 'rgba(26,115,232,0.16)',
  text: '#f5f5f5',
  textMuted: '#9aa0a6',
  textFaint: '#6b7075',
  success: '#81c995',
  warning: '#fdd663',
  danger: '#f28b82',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const sourceTypeIcons: Record<string, string> = {
  file: '📄',
  pdf: '📕',
  text: '📝',
  web: '🌐',
  youtube: '▶️',
  image: '🖼️',
  audio: '🎧',
  gdrive: '📁',
  gdrive_doc: '📘',
  gdrive_sheet: '📗',
  gdrive_slide: '📙',
  ebook: '📚',
  note: '🗒️',
  research: '🔎',
  chat_import: '💬',
  epub: '📖',
  docx: '📄',
  pptx: '📊',
  csv: '📊',
};
