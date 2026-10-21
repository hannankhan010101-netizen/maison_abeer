import {
  accentPhotoFor,
  chapterPhotoFor,
  type CraftKind,
  photosFor,
  photosOfCrafts,
  type StudioPhoto,
} from '@/lib/public/studioPhotos';

/**
 * Which photograph goes where on the storefront, decided once.
 *
 * The rule: no photograph more than twice on the page, and prefer one not yet
 * used. Slots fill in page order — the fan, the chapters, the wall, then the
 * marquee — and each takes the first photo of the right craft with a use
 * left, a photo with no uses beating one with one. A slot with no candidate
 * stays empty, and the marquee shows only when at least `MARQUEE_MIN` photos
 * are left for it, so it is a treat for a studio with three crafts rather
 * than the same four photos going round again.
 */

export const MAX_USES = 2;
export const MARQUEE_MIN = 6;

const FAN_SIZE = 3;
const WALL_MAX = 8;

export interface PhotoBudget {
  /** Exactly three when the studio teaches any craft, else empty. */
  fan: StudioPhoto[];
  chapters: Partial<Record<CraftKind, { large: StudioPhoto; accent: StudioPhoto }>>;
  /** At most eight. */
  wall: StudioPhoto[];
  /** Empty unless at least `MARQUEE_MIN` photos are left for it. */
  marquee: StudioPhoto[];
}

/**
 * The candidate with a use left and the fewest uses so far, ties going to the
 * earlier candidate; never one already in `taken`.
 */
function pick(
  candidates: readonly StudioPhoto[],
  uses: Map<string, number>,
  taken: readonly StudioPhoto[] = [],
): StudioPhoto | undefined {
  let best: StudioPhoto | undefined;
  let bestUses = MAX_USES;
  for (const item of candidates) {
    if (taken.includes(item)) continue;
    const count = uses.get(item.id) ?? 0;
    if (count < bestUses) {
      best = item;
      bestUses = count;
    }
  }
  if (best) uses.set(best.id, bestUses + 1);
  return best;
}

/** Fill up to `size` slots from `candidates`, none twice. */
function fill(candidates: readonly StudioPhoto[], uses: Map<string, number>, size: number) {
  const group: StudioPhoto[] = [];
  while (group.length < size) {
    const next = pick(candidates, uses, group);
    if (!next) break;
    group.push(next);
  }
  return group;
}

/** The preferred photo first, then the rest of its craft in their usual order. */
function preferring(first: StudioPhoto): StudioPhoto[] {
  return [first, ...photosFor(first.craft).filter((item) => item !== first)];
}

export function allocatePhotos(crafts: readonly CraftKind[]): PhotoBudget {
  const unique = [...new Set(crafts)];
  const pool = photosOfCrafts(unique);
  const uses = new Map<string, number>();

  const fan = fill(pool, uses, FAN_SIZE);

  const chapters: PhotoBudget['chapters'] = {};
  for (const craft of unique) {
    const large = pick(preferring(chapterPhotoFor(craft)), uses);
    if (!large) continue;
    const accent = pick(preferring(accentPhotoFor(craft)), uses, [large]);
    if (!accent) {
      uses.set(large.id, (uses.get(large.id) ?? 1) - 1);
      continue;
    }
    chapters[craft] = { large, accent };
  }

  const wall = fill(pool, uses, WALL_MAX);

  const left = pool.filter((item) => (uses.get(item.id) ?? 0) < MAX_USES);
  const marquee = left.length >= MARQUEE_MIN ? fill(left, uses, left.length) : [];

  return { fan, chapters, wall, marquee };
}

/** How many times each photo is shown, by id. */
export function usesOf(budget: PhotoBudget): Map<string, number> {
  const counts = new Map<string, number>();
  const all = [
    ...budget.fan,
    ...Object.values(budget.chapters).flatMap((chapter) => [chapter.large, chapter.accent]),
    ...budget.wall,
    ...budget.marquee,
  ];
  for (const item of all) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  return counts;
}
