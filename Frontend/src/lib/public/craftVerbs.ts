import type { CraftKind } from '@/lib/public/studioPhotos';

/**
 * The verbs each craft is made of, for the hero's promise line ("come
 * **throw** something with your own hands").
 *
 * Verbs describe the activity, not what a guest takes home, so the line claims
 * nothing a class would have to keep. Each is lowercase and at most six
 * characters: the roll is as wide as its widest verb, and a short ceiling keeps
 * the line from wrapping differently from one word to the next.
 */
export const CRAFT_VERBS: Record<CraftKind, readonly [string, string, string]> = {
  pottery: ['throw', 'centre', 'trim'],
  cake: ['pipe', 'frost', 'swirl'],
  painting: ['paint', 'dab', 'glaze'],
};

/** The verb for a studio with no classes, and the one a screen reader hears. */
export const FALLBACK_VERB = 'make';

/**
 * The crafts' verbs interleaved — first verb of each craft, then the second of
 * each, then the third — so a several-craft roll changes craft every word.
 * No crafts at all → `['make']`.
 */
export function verbsFor(crafts: readonly CraftKind[]): string[] {
  if (crafts.length === 0) return [FALLBACK_VERB];
  const verbs: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    for (const craft of crafts) verbs.push(CRAFT_VERBS[craft][index]!);
  }
  return verbs;
}
