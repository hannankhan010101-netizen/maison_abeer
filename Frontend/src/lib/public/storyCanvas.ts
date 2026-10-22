import {
  STORY_SIZE,
  storyFilename,
  storyLayout,
  type StoryFace,
  type StoryModel,
} from '@/lib/public/storyCard';
import type { CraftKind } from '@/lib/public/studioPhotos';
import { saveTicket } from '@/lib/public/ticketCanvas';

/**
 * Draws the quiz's Story picture in the guest's browser and hands it to them
 * through the same share-or-download path as the saved ticket.
 *
 * Client only, made from the model alone. A canvas has no CSS variables, so
 * the colours are literal copies of the light-theme tokens (`ogCard.tsx`) and
 * of each craft's `--craft-<kind>` / `--craft-<kind>-ink` pair in `tokens.css`.
 */

export { STORY_SIZE };

const C = {
  buttercream: '#fff8f0',
  paper: '#fffdfa',
  dot: '#ecdccb',
  cocoa: '#40302a',
  blush: '#fbe7ea',
  pink: '#f2aabe',
  rose: '#e2849e',
  roseDeep: '#c25b78',
  terra: '#c96f4a',
  sage: '#adbe93',
  butter: '#f7dc94',
} as const;

const CRAFT: Record<CraftKind, { tint: string; ink: string }> = {
  cake: { tint: '#fce4ea', ink: '#a3304f' },
  pottery: { tint: '#f9e3cf', ink: '#8f4521' },
  painting: { tint: '#e8e9f6', ink: '#55497a' },
};

interface Fonts {
  display: string;
  body: string;
  hand: string;
}

/** The family list `next/font` set on the page, read where `/book` sets it. */
function family(variable: string, generic: string): string {
  if (typeof document === 'undefined') return generic;
  const from = document.querySelector('.storefront') ?? document.documentElement;
  const loaded = getComputedStyle(from).getPropertyValue(variable).trim();
  return loaded ? `${loaded}, ${generic}` : generic;
}

async function loadFace(font: string): Promise<void> {
  try {
    await document.fonts?.load(font);
  } catch {
    // A face that will not load draws in its fallback; the picture still saves.
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A simple hand-drawn mark for each craft, centred on (cx, cy). */
function drawMark(ctx: CanvasRenderingContext2D, kind: CraftKind, cx: number, cy: number) {
  ctx.save();
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.cocoa;
  if (kind === 'cake') {
    roundedRect(ctx, cx - 110, cy - 30, 220, 120, 28);
    ctx.fillStyle = C.paper;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 110, cy + 5);
    for (let x = -110; x < 110; x += 44) {
      ctx.quadraticCurveTo(cx + x + 22, cy + 55, cx + x + 44, cy + 5);
    }
    ctx.lineTo(cx + 110, cy - 30);
    ctx.lineTo(cx - 110, cy - 30);
    ctx.closePath();
    ctx.fillStyle = C.pink;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy - 62, 26, 0, Math.PI * 2);
    ctx.fillStyle = C.roseDeep;
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'pottery') {
    ctx.beginPath();
    ctx.moveTo(cx - 55, cy - 100);
    ctx.lineTo(cx + 55, cy - 100);
    ctx.bezierCurveTo(cx + 40, cy - 40, cx + 140, cy - 10, cx + 95, cy + 90);
    ctx.lineTo(cx - 95, cy + 90);
    ctx.bezierCurveTo(cx - 140, cy - 10, cx - 40, cy - 40, cx - 55, cy - 100);
    ctx.closePath();
    ctx.fillStyle = C.terra;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 85, cy + 20);
    ctx.quadraticCurveTo(cx, cy + 45, cx + 85, cy + 20);
    ctx.strokeStyle = C.butter;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx, cy, 140, 105, -0.15, 0, Math.PI * 2);
    ctx.fillStyle = C.paper;
    ctx.fill();
    ctx.stroke();
    const dabs: Array<[number, number, string]> = [
      [-70, -40, C.rose],
      [-5, -60, C.butter],
      [60, -30, C.sage],
      [-75, 30, C.terra],
    ];
    for (const [dx, dy, colour] of dabs) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, 24, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx + 50, cy + 40, 22, 0, Math.PI * 2);
    ctx.fillStyle = C.buttercream;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function fontFor(fonts: Fonts, face: StoryFace, size: number, weight: number) {
  return `${weight} ${size}px ${fonts[face]}`;
}

function draw(ctx: CanvasRenderingContext2D, model: StoryModel, fonts: Fonts) {
  const { width, height } = STORY_SIZE;
  const craft = CRAFT[model.kind];

  ctx.fillStyle = C.buttercream;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = C.dot;
  for (let y = 18; y < height; y += 36) {
    for (let x = 18; x < width; x += 36) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const card = { x: 90, y: 200, w: 900, h: 1560, r: 48 };
  ctx.save();
  ctx.shadowColor = 'rgba(64, 48, 42, 0.12)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  roundedRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.clip();
  ctx.fillStyle = craft.tint;
  ctx.fillRect(card.x, card.y, card.w, 620);
  ctx.restore();

  ctx.save();
  ctx.setLineDash([18, 14]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = C.rose;
  roundedRect(ctx, card.x + 30, card.y + 30, card.w - 60, card.h - 60, 30);
  ctx.stroke();
  ctx.restore();

  const measure = (text: string, size: number, face: StoryFace, weight: number) => {
    ctx.font = fontFor(fonts, face, size, weight);
    return ctx.measureText(text).width;
  };
  const layout = storyLayout(model, measure);

  ctx.beginPath();
  ctx.arc(layout.mark.cx, layout.mark.cy, layout.mark.r, 0, Math.PI * 2);
  ctx.fillStyle = C.paper;
  ctx.fill();
  drawMark(ctx, model.kind, layout.mark.cx, layout.mark.cy);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const block of layout.blocks) {
    ctx.font = fontFor(fonts, block.face, block.size, block.weight);
    ctx.fillStyle =
      block.role === 'craft' || block.role === 'handle'
        ? craft.ink
        : block.role === 'kicker'
          ? C.roseDeep
          : C.cocoa;
    block.lines.forEach((text, index) => {
      ctx.fillText(text, block.x, block.y + index * block.lineHeight);
    });
  }
}

export async function renderStoryCard(model: StoryModel): Promise<Blob | null> {
  const fonts: Fonts = {
    display: family('--font-storefront-display-loaded', 'Georgia, serif'),
    body: family('--font-body-loaded', 'system-ui, sans-serif'),
    hand: family('--font-hand-loaded', 'cursive'),
  };
  await Promise.all([
    loadFace(fontFor(fonts, 'display', 96, 500)),
    loadFace(fontFor(fonts, 'body', 46, 400)),
    loadFace(fontFor(fonts, 'body', 44, 800)),
    loadFace(fontFor(fonts, 'hand', 64, 700)),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = STORY_SIZE.width;
  canvas.height = STORY_SIZE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  draw(ctx, model, fonts);

  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/** Draws the picture and shares or downloads it as `maison-<craft>-vibe.png`. */
export async function saveStory(
  model: StoryModel,
): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  const blob = await renderStoryCard(model);
  if (!blob) return 'failed';
  return saveTicket(blob, storyFilename(model.kind));
}
