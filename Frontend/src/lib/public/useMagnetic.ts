import { useEffect, useRef } from 'react';

import { prefersReducedMotion } from '@/lib/public/motion';

/**
 * A button that leans a few pixels toward the cursor as it approaches, and
 * settles back once it leaves — the "magnetic" micro-interaction that reads
 * as a physical object responding to proximity rather than a hitbox with a
 * hover state.
 *
 * `gsap.quickTo` rather than `gsap.to` on every move: it reuses one tween
 * per axis and just retargets it, which is what keeps a handler firing on
 * every `pointermove` cheap instead of spinning up a new tween per event.
 *
 * `import('gsap')` rather than a top-level import — this is one decorative
 * hover effect on one button; the hero's first paint shouldn't wait on
 * fetching an animation library for it, so it loads as its own chunk once
 * the page is already interactive.
 *
 * Desktop-with-a-mouse only — a touch device has no "approaching" gesture
 * for this to respond to, and `prefers-reduced-motion` opts out entirely.
 */
export function useMagnetic<T extends HTMLElement>(strength = 14) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion()) return;
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(pointer: fine)').matches) {
      return;
    }

    let cancelled = false;
    let cleanupListeners: (() => void) | undefined;

    import('gsap').then(({ default: gsap }) => {
      if (cancelled || !node) return;

      const moveX = gsap.quickTo(node, 'x', { duration: 0.5, ease: 'power3.out' });
      const moveY = gsap.quickTo(node, 'y', { duration: 0.5, ease: 'power3.out' });

      const onMove = (event: PointerEvent) => {
        const rect = node.getBoundingClientRect();
        const relX = event.clientX - (rect.left + rect.width / 2);
        const relY = event.clientY - (rect.top + rect.height / 2);
        moveX(Math.max(-strength, Math.min(strength, relX * 0.35)));
        moveY(Math.max(-strength, Math.min(strength, relY * 0.35)));
      };

      const onLeave = () => {
        moveX(0);
        moveY(0);
      };

      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerleave', onLeave);

      cleanupListeners = () => {
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerleave', onLeave);
        gsap.killTweensOf(node);
      };
    });

    return () => {
      cancelled = true;
      cleanupListeners?.();
    };
  }, [strength]);

  return ref;
}
