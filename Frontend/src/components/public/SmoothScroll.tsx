'use client';

import { useEffect } from 'react';

import { prefersReducedMotion } from '@/lib/public/motion';
import { setLenis } from '@/lib/public/lenisBridge';

/**
 * Inertia scrolling for this page only — mounted inside the booking route,
 * not the app shell, so nothing outside `/book/[slug]` inherits it.
 *
 * Lenis intercepts the wheel/touch event and re-times the scroll itself,
 * which is precisely the kind of motion `prefers-reduced-motion` exists to
 * veto: skip mounting it entirely rather than starting it and trying to
 * tune it down, so a reduced-motion visitor gets plain native scrolling
 * with zero Lenis code ever running or downloaded.
 *
 * `import('lenis')` rather than a top-level import: this is a decorative
 * enhancement, not something the hero's first paint should ever wait on, so
 * it ships as its own chunk fetched after mount instead of inflating the
 * page's eagerly-loaded bundle — the same reasoning that already keeps
 * `three` out of it via `Hero3D`'s `next/dynamic`.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    let cancelled = false;
    let frame: number;
    let lenisInstance: import('lenis').default | null = null;

    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;

      const lenis = new Lenis({
        duration: 1.1,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
        smoothWheel: true,
      });
      lenisInstance = lenis;
      setLenis(lenis);

      const raf = (time: number) => {
        lenis.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      setLenis(null);
      lenisInstance?.destroy();
    };
  }, []);

  return null;
}
