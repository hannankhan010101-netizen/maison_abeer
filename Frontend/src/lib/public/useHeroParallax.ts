import { useEffect, useRef } from 'react';

import { prefersReducedMotion } from '@/lib/public/motion';

/**
 * Luxury-subtle mouse parallax on the hero photo: the image drifts a few
 * pixels opposite the cursor, damped rather than snapping straight to it,
 * so it reads as weight rather than as a UI reacting to input.
 *
 * Written as direct DOM mutation on a ref, not React state — this fires on
 * every pointermove, and re-rendering the component tree at that rate would
 * be wasteful for a transform that never needs to touch anything else.
 *
 * Skipped entirely — no listeners attached — for touch devices (no
 * meaningful hover position to track) and for `prefers-reduced-motion`,
 * matching every other motion gate on this page.
 */
export function useHeroParallax<T extends HTMLElement>(maxOffsetPx = 12) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (prefersReducedMotion()) return;
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(pointer: fine)').matches) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame: number;

    const onMove = (event: PointerEvent) => {
      const nx = (event.clientX / window.innerWidth) * 2 - 1; // -1..1
      const ny = (event.clientY / window.innerHeight) * 2 - 1;
      // Opposite the cursor: the image leans away, like it's being looked
      // around rather than dragged toward the pointer.
      targetX = -nx * maxOffsetPx;
      targetY = -ny * maxOffsetPx * 0.6;
    };

    const tick = () => {
      // Exponential smoothing toward the target — the damping that makes
      // this feel like inertia rather than direct manipulation.
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;
      node.style.setProperty('--parallax-x', `${currentX.toFixed(2)}px`);
      node.style.setProperty('--parallax-y', `${currentY.toFixed(2)}px`);
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [maxOffsetPx]);

  return ref;
}
