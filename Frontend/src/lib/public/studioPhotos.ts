/**
 * The studio's photographs, and what they are of.
 *
 * Self-hosted in `public/studio/` (credits in `CREDITS.md` there) rather than
 * linked from a photo site: a guest from an ad makes no third-party request,
 * and a changed link upstream cannot blank the page. Each photo ships twice —
 * 1400px wide, and an 800px copy a phone is sent instead (`StudioImage`'s
 * `srcSet`) — so a phone on mobile data fetches about a quarter of the bytes.
 *
 * `width` and `height` are the real pixel size of the 1400px file. They give
 * the browser the aspect ratio before the file arrives, so nothing shifts when
 * it does; `studioPhotos.test.ts` reads each JPEG's header and fails if they
 * drift. `tone` is the photo's average colour, painted behind it while it
 * loads so a card never flashes empty.
 *
 * These are the fallback for the crafts the studio teaches. A class type's own
 * photo (Brand Kit → class photos) always wins where it exists.
 */

export type CraftKind = 'pottery' | 'cake' | 'painting';

export interface StudioPhoto {
  id: string;
  craft: CraftKind;
  /** 1400px-wide file. */
  src: string;
  /** 800px-wide file, for phones. */
  small: string;
  width: number;
  height: number;
  /** Average colour, shown while the photo loads. */
  tone: string;
  alt: string;
  /** The line handwritten under it when it is a polaroid. */
  caption: string;
}

const DIR = '/studio';

function photo(
  id: string,
  craft: CraftKind,
  width: number,
  height: number,
  tone: string,
  alt: string,
  caption: string,
): StudioPhoto {
  return {
    id,
    craft,
    src: `${DIR}/${id}.jpg`,
    small: `${DIR}/${id}-800.jpg`,
    width,
    height,
    tone,
    alt,
    caption,
  };
}

export const STUDIO_PHOTOS: readonly StudioPhoto[] = [
  photo(
    'pottery-wheel-cup',
    'pottery',
    1400,
    933,
    '#7c7066',
    'Hands shaping a small clay cup on a spinning pottery wheel',
    'on the wheel',
  ),
  photo(
    'pottery-vase',
    'pottery',
    1400,
    933,
    '#5f5450',
    'Hands smoothing a tall clay vase as it turns',
    'centre it',
  ),
  photo(
    'pottery-group',
    'pottery',
    1400,
    2100,
    '#90785c',
    'Friends working side by side at a pottery workshop table',
    'clay day',
  ),
  photo(
    'pottery-pot',
    'pottery',
    1400,
    2100,
    '#887c74',
    'A potter’s hands holding a freshly thrown pot',
    'fresh off the wheel',
  ),
  photo(
    'cake-drip',
    'cake',
    1400,
    1866,
    '#cbbab2',
    'A pink drip cake with sprinkles on a white cake stand',
    'drip, drip',
  ),
  photo(
    'cake-piping',
    'cake',
    1400,
    2100,
    '#948359',
    'A baker piping cream from a piping bag',
    'pipe dreams',
  ),
  photo(
    'cake-frosting',
    'cake',
    1400,
    933,
    '#f6b3d1',
    'Swirls of pink buttercream frosting',
    'swirl it',
  ),
  photo(
    'cake-cupcakes',
    'cake',
    1400,
    1123,
    '#c1b3b0',
    'Cupcakes piled high with pastel frosting and sprinkles',
    'sprinkles, obviously',
  ),
  photo(
    'paint-butterfly',
    'painting',
    1400,
    933,
    '#7c6d60',
    'A woman painting a butterfly onto a ceramic plate',
    'tiny brushstrokes',
  ),
  photo(
    'paint-bowl',
    'painting',
    1400,
    2100,
    '#7e6c5d',
    'A hand painting the inside of a ceramic bowl',
    'paint it your way',
  ),
  photo(
    'paint-dandelion',
    'painting',
    1400,
    933,
    '#738c94',
    'A blue ceramic bowl painted with dandelion seeds',
    'dandelion wishes',
  ),
  photo(
    'paint-stars',
    'painting',
    1400,
    933,
    '#596e77',
    'A blue ceramic plate painted with little white stars',
    'starry plate',
  ),
];

/**
 * Which photo plays which part, per craft.
 *
 * `cover` is the craft's face — the polaroid fan, the first in the strips.
 * `chapter` is the tall portrait that fills the craft's section, and `accent`
 * the small one pinned to its corner.
 */
const SETS: Record<CraftKind, { cover: string; chapter: string; accent: string }> = {
  pottery: { cover: 'pottery-wheel-cup', chapter: 'pottery-group', accent: 'pottery-vase' },
  cake: { cover: 'cake-drip', chapter: 'cake-piping', accent: 'cake-frosting' },
  painting: { cover: 'paint-butterfly', chapter: 'paint-bowl', accent: 'paint-dandelion' },
};

const BY_ID = new Map(STUDIO_PHOTOS.map((item) => [item.id, item]));

function byId(id: string): StudioPhoto {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`studioPhotos: no photo named ${id}`);
  return found;
}

/**
 * The craft a class's colour token stands for.
 *
 * The same language the admin calendar and name tags use — pink is bento
 * cake, terracotta is pottery, sage is ceramic painting — and, like
 * `BookingFlow`'s accent table, anything unrecognised reads as the default
 * pink, which is cake.
 */
export function craftOf(token: string): CraftKind {
  if (token === 'terra') return 'pottery';
  if (token === 'sage') return 'painting';
  return 'cake';
}

export function coverFor(craft: CraftKind): StudioPhoto {
  return byId(SETS[craft].cover);
}

export function chapterPhotoFor(craft: CraftKind): StudioPhoto {
  return byId(SETS[craft].chapter);
}

export function accentPhotoFor(craft: CraftKind): StudioPhoto {
  return byId(SETS[craft].accent);
}

export function photosFor(craft: CraftKind): StudioPhoto[] {
  return STUDIO_PHOTOS.filter((item) => item.craft === craft);
}

/** The distinct crafts a class list covers, first-seen order. */
export function craftsIn(tokens: readonly string[]): CraftKind[] {
  return [...new Set(tokens.map(craftOf))];
}

/**
 * Photos of exactly the crafts on offer — never of one the studio does not
 * run. Covers lead, then the rest, so the first things a guest sees are each
 * craft's best.
 */
export function photosOfCrafts(crafts: readonly CraftKind[]): StudioPhoto[] {
  const covers = crafts.map(coverFor);
  const rest = crafts.flatMap((craft) => photosFor(craft)).filter((item) => !covers.includes(item));

  return [...covers, ...rest];
}

/**
 * Exactly `count` photos for the polaroid fan: each craft's cover first, then
 * further photos of the same crafts, cycling, so a studio that teaches one
 * craft still gets a full fan.
 */
export function fanPhotos(crafts: readonly CraftKind[], count: number): StudioPhoto[] {
  const pool = photosOfCrafts(crafts);
  if (pool.length === 0) return [];

  return Array.from({ length: count }, (_, index) => pool[index % pool.length]!);
}

/**
 * What a craft is, in the studio's voice. About the craft, never a promise
 * about a particular class — nothing here claims a length, a price, what you
 * take home or how it is fired.
 */
export const CRAFT_COPY: Record<CraftKind, { eyebrow: string; blurb: string }> = {
  pottery: {
    eyebrow: 'clay under your fingertips',
    blurb:
      'Wet clay, a wheel that never stops turning and two steady hands. Centre it, open it up, and watch a lump of earth become a vessel.',
  },
  cake: {
    eyebrow: 'frosting is a love language',
    blurb:
      'Little cakes with big personality. Swirl, pipe and sprinkle, then write whatever your heart says right on top.',
  },
  painting: {
    eyebrow: 'a brush, a plate, no rules',
    blurb:
      'A blank piece, a row of little pots of colour and all the time in the world. Paint it tidy, paint it loose, paint it completely wild.',
  },
};
