import type Lenis from 'lenis';

/**
 * The hero's "Explore classes" CTA needs to trigger the same eased scroll
 * Lenis is already giving wheel/touch input, rather than a plain instant
 * jump that would feel like a different page underneath it. `SmoothScroll`
 * is the only thing that ever constructs a `Lenis` instance; this is just
 * the handoff so a component three levels away can reach it without
 * threading a prop or standing up a context provider for one call site.
 *
 * `null` (no `SmoothScroll` mounted, or `prefers-reduced-motion`) is the
 * expected common case — callers fall back to native `scrollIntoView`.
 */
let instance: Lenis | null = null;

export function setLenis(lenis: Lenis | null) {
  instance = lenis;
}

export function scrollToId(id: string) {
  const target = document.getElementById(id);
  if (!target) return;

  if (instance) {
    instance.scrollTo(target, { offset: -16 });
  } else {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
