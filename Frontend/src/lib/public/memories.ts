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
