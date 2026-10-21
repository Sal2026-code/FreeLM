/**
 * FreeLM — slide rendering.
 *
 * Renders slide PNGs with @napi-rs/canvas (prebuilt binaries, no native
 * compile step). The same renderer produces:
 *   • Video Overview scenes
 *   • Slide Deck slides
 *   • Infographics
 *
 * Five visual styles, matching the Video Overview style picker.
 */

import { createCanvas } from '@napi-rs/canvas';

/**
 * The subset of the 2D canvas API this renderer uses.
 *
 * `@napi-rs/canvas` ships its own context type, which does not line up with
 * the DOM's `CanvasRenderingContext2D` (the DOM version requires members
 * Node's canvas does not implement). Declaring the surface we actually use
 * keeps both platforms happy.
 */
interface RenderContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  strokeText?(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(
    cpx: number,
    cpy: number,
    x: number,
    y: number,
  ): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): void;
  fill(): void;
  stroke(): void;
  save(): void;
  restore(): void;
}

export type SlideStyle =
  | 'scientific'
  | 'professional'
  | 'editorial'
  | 'sketch_note'
  | 'explainer';

export interface SlidePalette {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  border: string;
}

const PALETTES: Record<SlideStyle, SlidePalette> = {
  scientific: {
    background: '#f7f9fc',
    surface: '#ffffff',
    text: '#0b1f33',
    muted: '#5a6b7d',
    accent: '#1a73e8',
    accentText: '#ffffff',
    border: '#d8e0ea',
  },
  professional: {
    background: '#0f1115',
    surface: '#171a21',
    text: '#f2f4f7',
    muted: '#9aa4b2',
    accent: '#4285f4',
    accentText: '#ffffff',
    border: '#252a34',
  },
  editorial: {
    background: '#fdf8f3',
    surface: '#ffffff',
    text: '#1c1917',
    muted: '#6b625a',
    accent: '#c2410c',
    accentText: '#ffffff',
    border: '#e7ddd2',
  },
  sketch_note: {
    background: '#fffdf5',
    surface: '#ffffff',
    text: '#2f2a20',
    muted: '#7a705d',
    accent: '#eab308',
    accentText: '#2f2a20',
    border: '#ece3c9',
  },
  explainer: {
    background: '#0b0f14',
    surface: '#141b23',
    text: '#eef2f7',
    muted: '#94a3b8',
    accent: '#22d3ee',
    accentText: '#04212a',
    border: '#1e293b',
  },
};

export interface SlideContent {
  heading: string;
  bullets: string[];
  /** Optional footer, usually the source citation. */
  footer?: string;
  /** Rendered as a big title slide when true. */
  isTitle?: boolean;
  title?: string;
  subtitle?: string;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  style?: SlideStyle;
}

/** Render one slide to PNG bytes. */
export async function renderSlide(
  content: SlideContent,
  options: RenderOptions = {},
): Promise<Buffer> {
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const palette = PALETTES[options.style ?? 'professional'];

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as unknown as RenderContext;

  // Background
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  // Accent bar on the left edge
  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, 0, 14, height);

  if (content.isTitle) {
    drawTitleSlide(ctx, content, palette, width, height);
  } else {
    drawContentSlide(ctx, content, palette, width, height);
  }

  return canvas.toBuffer('image/png');
}

function drawTitleSlide(
  ctx: RenderContext,
  content: SlideContent,
  palette: SlidePalette,
  width: number,
  height: number,
): void {
  ctx.textAlign = 'center';

  const title = content.title ?? content.heading;
  ctx.fillStyle = palette.text;
  ctx.font = 'bold 68px Inter, "Segoe UI", system-ui, sans-serif';
  const titleLines = wrapText(ctx, title, width - 200);
  const startY = height / 2 - (titleLines.length - 1) * 44 - 30;
  titleLines.forEach((line, index) => {
    ctx.fillText(line, width / 2, startY + index * 88);
  });

  if (content.subtitle) {
    ctx.fillStyle = palette.muted;
    ctx.font = '30px Inter, "Segoe UI", system-ui, sans-serif';
    const subtitleLines = wrapText(ctx, content.subtitle, width - 260);
    subtitleLines.forEach((line, index) => {
      ctx.fillText(line, width / 2, startY + titleLines.length * 88 + 30 + index * 42);
    });
  }

  // Footer rule
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 90, height - 120);
  ctx.lineTo(width / 2 + 90, height - 120);
  ctx.stroke();

  if (content.footer) {
    ctx.fillStyle = palette.muted;
    ctx.font = '20px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(content.footer, width / 2, height - 76);
  }
}

function drawContentSlide(
  ctx: RenderContext,
  content: SlideContent,
  palette: SlidePalette,
  width: number,
  height: number,
): void {
  ctx.textAlign = 'left';

  // Heading
  ctx.fillStyle = palette.text;
  ctx.font = 'bold 46px Inter, "Segoe UI", system-ui, sans-serif';
  const headingLines = wrapText(ctx, content.heading, width - 140);
  headingLines.forEach((line, index) => {
    ctx.fillText(line, 72, 110 + index * 58);
  });

  const bodyTop = 110 + headingLines.length * 58 + 36;

  // Accent underline
  ctx.fillStyle = palette.accent;
  ctx.fillRect(72, bodyTop - 26, 96, 5);

  // Bullets
  ctx.font = '30px Inter, "Segoe UI", system-ui, sans-serif';
  let y = bodyTop + 34;
  for (const bullet of content.bullets) {
    const lines = wrapText(ctx, bullet, width - 190);
    // Bullet dot
    ctx.beginPath();
    ctx.arc(86, y - 10, 7, 0, Math.PI * 2);
    ctx.fillStyle = palette.accent;
    ctx.fill();

    ctx.fillStyle = palette.text;
    lines.forEach((line, index) => {
      ctx.fillText(line, 118, y + index * 42);
    });
    y += lines.length * 42 + 22;

    if (y > height - 130) break;
  }

  // Footer
  if (content.footer) {
    ctx.fillStyle = palette.muted;
    ctx.font = '19px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(content.footer, 72, height - 56);
  }
}

/** Render an infographic PNG from structured sections. */
export async function renderInfographic(
  content: {
    title: string;
    subtitle: string;
    sections: { heading: string; bullets: string[] }[];
    palette: string;
    footer?: string;
  },
  options: { width?: number; height?: number; style?: SlideStyle } = {},
): Promise<Buffer> {
  const width = options.width ?? 1080;
  const height = options.height ?? 1350;
  const base = PALETTES[options.style ?? 'professional'];
  const palette: SlidePalette = {
    ...base,
    accent: content.palette || base.accent,
  };

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as unknown as RenderContext;

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  // Header band
  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, 0, width, 260);

  ctx.fillStyle = palette.accentText;
  ctx.font = 'bold 54px Inter, "Segoe UI", system-ui, sans-serif';
  const titleLines = wrapText(ctx, content.title, width - 120);
  titleLines.forEach((line, index) => {
    ctx.fillText(line, 60, 110 + index * 64);
  });

  ctx.font = '26px Inter, "Segoe UI", system-ui, sans-serif';
  const subtitleLines = wrapText(ctx, content.subtitle, width - 120);
  subtitleLines.forEach((line, index) => {
    ctx.fillText(line, 60, 110 + titleLines.length * 64 + 14 + index * 36);
  });

  // Sections
  let y = 320;
  const cardHeight = 200;
  for (const section of content.sections) {
    if (y + cardHeight > height - 80) break;

    // Card
    roundRect(ctx, 50, y, width - 100, cardHeight - 24, 18);
    ctx.fillStyle = palette.surface;
    ctx.fill();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Section heading
    ctx.fillStyle = palette.accent;
    ctx.font = 'bold 32px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(section.heading, 82, y + 54);

    // Bullets
    ctx.fillStyle = palette.text;
    ctx.font = '23px Inter, "Segoe UI", system-ui, sans-serif';
    let bulletY = y + 96;
    for (const bullet of section.bullets.slice(0, 4)) {
      const lines = wrapText(ctx, bullet, width - 200);
      lines.forEach((line, index) => {
        ctx.fillText(line, 108, bulletY + index * 32);
      });
      bulletY += lines.length * 32 + 10;
      if (bulletY > y + cardHeight - 20) break;
    }

    y += cardHeight;
  }

  if (content.footer) {
    ctx.fillStyle = palette.muted;
    ctx.font = '18px Inter, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(content.footer, 50, height - 36);
  }

  return canvas.toBuffer('image/png');
}

function roundRect(
  ctx: RenderContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Greedy word wrap that respects the canvas measurement. */
function wrapText(
  ctx: RenderContext,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = words[0] ?? '';

  for (let i = 1; i < words.length; i += 1) {
    const word = words[i] ?? '';
    const candidate = `${current} ${word}`;
    if (ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

