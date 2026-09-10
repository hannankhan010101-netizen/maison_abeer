/**
 * The one place this page's motion code asks "is it OK to animate this
 * guest" — every other file that needs the answer imports this instead of
 * repeating the `window.matchMedia` guard itself.
 *
 * `matchMedia` missing entirely (some test environments, a handful of
 * embedded/legacy WebViews) counts as "prefers reduced": the safe default
 * for a guest this can't ask is to do less, not more.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
