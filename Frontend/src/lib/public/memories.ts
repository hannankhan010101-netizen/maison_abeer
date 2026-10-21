import type { PublicMemory } from './api';
import { photosOfCrafts, type CraftKind } from './studioPhotos';

/**
 * What the memory wall shows, and what it is honest to call it.
 *
 * The studio's own memories, once it has added some, are the only thing the
 * wall shows, under "Memories from the studio". Until then the wall shows the
 * craft photography the page already owns, framed as what a guest will make —
 * stock is never passed off as the studio's memories, and the two are never
 * mixed.
 */

export interface Memory {
  id: string;
  photo: { src: string; small?: string; width: number; height: number; alt: string; tone: string };
  caption: string;
  craft: CraftKind | null;
  origin: 'studio' | 'craft';
}

/** A bento mosaic reads as a mosaic up to about this many; more is a scroll. */
export const MAX_TILES = 8;

// The studio's own photos come from a link, so their pixel size is unknown;
// a landscape frame is only a placeholder the tile crops to anyway.
const UNKNOWN_SIZE = { width: 1200, height: 900 };
const UNKNOWN_TONE = '#e9ddd3';

export function buildMemories(
  crafts: readonly CraftKind[],
  studio: readonly PublicMemory[] | undefined,
): { heading: string; eyebrow: string; items: Memory[] } {
  if (studio && studio.length > 0) {
    return {
      heading: 'Memories from the studio',
      eyebrow: 'kept from the shelves',
      items: studio.slice(0, MAX_TILES).map((memory) => ({
        id: memory.id,
        photo: {
          src: memory.photo_url,
          ...UNKNOWN_SIZE,
          alt: memory.caption,
          tone: UNKNOWN_TONE,
        },
        caption: memory.caption,
        craft: memory.craft,
        origin: 'studio' as const,
      })),
    };
  }

  return {
    heading: "What you'll make here",
    eyebrow: 'a peek at the mess',
    items: photosOfCrafts(crafts)
      .slice(0, MAX_TILES)
      .map((photo) => ({
        id: photo.id,
        photo: {
          src: photo.src,
          small: photo.small,
          width: photo.width,
          height: photo.height,
          alt: photo.alt,
          tone: photo.tone,
        },
        caption: photo.caption,
        craft: photo.craft,
        origin: 'craft' as const,
      })),
  };
}

/** How many grid cells a tile covers: columns wide, rows tall. */
export interface Span {
  w: 1 | 2 | 4;
  h: 1 | 2;
}

/**
 * Whether tiles laid out by CSS `grid-auto-flow: dense` fill every cell, on a
 * grid `cols` wide. A tile wider than the grid is clamped to it, as the
 * stylesheet does on a phone.
 */
export function packs(spans: readonly Span[], cols: number): boolean {
  const filled: boolean[][] = [];
  const fits = (row: number, col: number, w: number, h: number) => {
    if (col + w > cols) return false;
    for (let r = row; r < row + h; r += 1)
      for (let c = col; c < col + w; c += 1) if (filled[r]?.[c]) return false;
    return true;
  };

  for (const span of spans) {
    const w = Math.min(span.w, cols);
    let placed = false;
    for (let row = 0; !placed; row += 1) {
      for (let col = 0; col < cols && !placed; col += 1) {
        if (!fits(row, col, w, span.h)) continue;
        for (let r = row; r < row + span.h; r += 1) {
          filled[r] ??= Array.from({ length: cols }, () => false);
          for (let c = col; c < col + w; c += 1) filled[r]![c] = true;
        }
        placed = true;
      }
    }
  }

  return filled.every((row) => Array.from(row).every(Boolean));
}

const PORTRAIT_CHOICES: Span[] = [
  { w: 1, h: 2 },
  { w: 1, h: 1 },
  { w: 2, h: 2 },
  { w: 2, h: 1 },
  { w: 4, h: 2 },
  { w: 4, h: 1 },
];
const LANDSCAPE_CHOICES: Span[] = [
  { w: 1, h: 1 },
  { w: 2, h: 1 },
  { w: 1, h: 2 },
  { w: 2, h: 2 },
  { w: 4, h: 1 },
  { w: 4, h: 2 },
];

/**
 * How big each tile is, chosen so the mosaic has no empty cell on either the
 * four-column desktop grid or the two-column phone grid.
 *
 * Each tile starts as its photograph's own shape (a portrait is two rows tall)
 * and is only changed where the whole would otherwise leave a gap — widened, or
 * brought down to one row. The first arrangement that packs on both grids wins,
 * preferring the natural shape of the earliest tiles. `cells` is the desktop
 * area, always a multiple of four.
 */
export function layoutSpans(items: readonly { portrait: boolean }[]): {
  spans: Span[];
  cells: number;
} {
  const chosen: Span[] = [];

  const search = (index: number): boolean => {
    if (index === items.length) return packs(chosen, 4) && packs(chosen, 2);
    const choices = items[index]!.portrait ? PORTRAIT_CHOICES : LANDSCAPE_CHOICES;
    for (const choice of choices) {
      chosen[index] = choice;
      if (search(index + 1)) return true;
    }
    chosen.length = index;
    return false;
  };

  if (!search(0)) {
    // Unreachable for the sizes this wall uses; a plain grid beats no wall.
    const plain: Span[] = items.map(() => ({ w: 1, h: 1 }));
    return { spans: plain, cells: plain.length };
  }

  return { spans: [...chosen], cells: chosen.reduce((sum, s) => sum + s.w * s.h, 0) };
}
