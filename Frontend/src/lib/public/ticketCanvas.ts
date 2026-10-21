import { type TicketModel, wrapLines } from '@/lib/public/ticket';

/**
 * Draws the saved ticket in the guest's own browser and hands it to them.
 *
 * Client only. The picture is made from the model alone (studio, class, day,
 * time, location): their clock, their timezone, the page's own loaded fonts,
 * and no server round trip or URL carrying booking details.
 *
 * A canvas has no CSS variables, so every colour is a literal copy of the
 * light-theme tokens (the same list `ogCard.tsx` keeps).
 */

export const TICKET_SIZE = { width: 1080, height: 1350 } as const;

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

/**
 * The family list `next/font` put on <html> (its generated name plus a
 * size-adjusted fallback), so the canvas uses the very face the page shows.
 * A missing variable falls back to the generic family.
 */
function family(variable: string, generic: string): string {
  const loaded =
    typeof document === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return loaded ? `${loaded}, ${generic}` : generic;
}

async function loadFace(font: string): Promise<void> {
  try {
    await document.fonts?.load(font);
  } catch {
    // A face that will not load draws in its fallback; the ticket still saves.
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

function draw(ctx: CanvasRenderingContext2D, model: TicketModel, fonts: Fonts) {
  const { width, height } = TICKET_SIZE;

  // Paper with the dotted texture.
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

  // The ticket.
  const card = { x: 110, y: 130, w: 860, h: 1090, r: 40 };
  const tearY = 960;
  ctx.save();
  ctx.shadowColor = 'rgba(64, 48, 42, 0.12)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  roundedRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.restore();

  // A pink band across the top, like the class card's colour bar.
  ctx.save();
  roundedRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.clip();
  ctx.fillStyle = C.pink;
  ctx.fillRect(card.x, card.y, card.w, 22);
  ctx.restore();

  // The dashed stub edge, inset from the card.
  ctx.save();
  ctx.setLineDash([18, 14]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = C.rose;
  roundedRect(ctx, card.x + 30, card.y + 52, card.w - 60, card.h - 82, 26);
  ctx.stroke();
  ctx.restore();

  // The tear line with a notch at each end.
  ctx.fillStyle = C.buttercream;
  for (const cx of [card.x, card.x + card.w]) {
    ctx.beginPath();
    ctx.arc(cx, tearY, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.setLineDash([4, 16]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.cocoa;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(card.x + 56, tearY);
  ctx.lineTo(card.x + card.w - 56, tearY);
  ctx.stroke();
  ctx.restore();

  const left = card.x + 90;
  const textWidth = card.w - 180;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Studio, small.
  ctx.fillStyle = C.roseDeep;
  ctx.font = `800 34px ${fonts.body}`;
  ctx.fillText(model.studio.toUpperCase(), left, card.y + 160, textWidth);

  ctx.fillStyle = C.cocoa;
  ctx.font = `400 30px ${fonts.body}`;
  ctx.globalAlpha = 0.75;
  ctx.fillText('Your seat is saved', left, card.y + 212, textWidth);
  ctx.globalAlpha = 1;

  // The class, large and wrapped.
  ctx.font = `400 84px ${fonts.display}`;
  const nameLines = wrapLines((text) => ctx.measureText(text).width, model.className, textWidth, 2);
  let y = card.y + 340;
  for (const line of nameLines) {
    ctx.fillText(line, left, y);
    y += 100;
  }

  // Day and time.
  y += 40;
  ctx.fillStyle = C.blush;
  roundedRect(ctx, left - 24, y - 64, textWidth + 48, model.location ? 250 : 170, 24);
  ctx.fill();

  ctx.fillStyle = C.cocoa;
  ctx.font = `700 46px ${fonts.body}`;
  ctx.fillText(model.day, left, y, textWidth);
  y += 66;
  ctx.font = `400 44px ${fonts.body}`;
  ctx.fillText(model.time, left, y, textWidth);

  if (model.location) {
    y += 76;
    ctx.font = `400 40px ${fonts.body}`;
    const [place] = wrapLines((text) => ctx.measureText(text).width, model.location, textWidth, 1);
    if (place) ctx.fillText(place, left, y);
  }

  // Below the tear, in the page's own hand.
  ctx.fillStyle = C.roseDeep;
  ctx.font = `700 76px ${fonts.hand}`;
  ctx.textAlign = 'center';
  ctx.fillText('see you at the studio ♡', width / 2, tearY + 150, textWidth);
}

interface Fonts {
  display: string;
  body: string;
  hand: string;
}

export async function renderTicket(model: TicketModel): Promise<Blob | null> {
  const fonts: Fonts = {
    display: family('--font-display-loaded', 'Georgia, serif'),
    body: family('--font-body-loaded', 'system-ui, sans-serif'),
    hand: family('--font-hand-loaded', 'cursive'),
  };
  await Promise.all([
    loadFace(`400 84px ${fonts.display}`),
    loadFace(`700 46px ${fonts.body}`),
    loadFace(`700 76px ${fonts.hand}`),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = TICKET_SIZE.width;
  canvas.height = TICKET_SIZE.height;
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

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a beat to start the download before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The share sheet where the phone can share files (so "Save image" is one tap
 * away), otherwise a plain download. A dismissed sheet is the guest's choice,
 * not an error, and starts no download.
 */
export async function saveTicket(
  blob: Blob,
  filename: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const data: ShareData = { files: [file] };

  if (typeof navigator.share === 'function' && navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }

  download(blob, filename);
  return 'downloaded';
}
