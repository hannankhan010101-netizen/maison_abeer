import { useEffect, useRef } from 'react';

import { useMayAnimate } from '@/lib/public/useMayAnimate';

/**
 * How far the page has scrolled, as a CSS variable on one element.
 *
 * `--scroll-y` (in px) is written to the node on every scrolled frame, and
 * anything beneath it can move by some fraction of it in plain CSS —
 * `calc(var(--scroll-y) * -0.06)` — without React re-rendering or a
 * listener per layer. One passive listener, one write per animation frame,
 * and only `transform` ever changes downstream, so the browser never lays
 * anything out for it.
 *
 * Under `useMayAnimate`'s three vetoes (reduced motion, Data Saver, a slow
 * connection) no listener is attached and the variable is never set: every
 * layer that reads it falls back to its `0px` default and simply stays put.
 */
export function useScrollDrift<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const mayAnimate = useMayAnimate();

  useEffect(() => {
    const node = ref.current;
    if (!node || !mayAnimate) return;

    let frame = 0;

    const write = () => {
      frame = 0;
      node.style.setProperty('--scroll-y', `${Math.round(window.scrollY)}px`);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };

    write();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      node.style.removeProperty('--scroll-y');
    };
  }, [mayAnimate]);

  return ref;
}
