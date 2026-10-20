import { useEffect, useRef } from 'react';

import { prefersReducedMotion } from '@/lib/public/motion';

/**
 * Lean a card toward the pointer.
 *
 * Writes four custom properties on the element — `--rx`, `--ry` (degrees) and
 * `--gx`, `--gy` (where a glare should sit, as percentages of the card) — and
 * leaves the geometry to CSS. One write per animation frame however fast the
 * pointer moves, and direct DOM writes rather than state: a re-render per
 * pointer event would cost far more than the effect is worth.
 *
 * Only for a mouse. A touch screen has no pointer hovering over a card, and a
 * guest who asked for less motion has asked for exactly this to go away; in both
 * cases no listener is ever attached.
 */
export function useTilt<T extends HTMLElement>(maxDeg = 8) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion()) return;
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(pointer: fine)').matches) {
      return;
    }

    let frame = 0;
    // The pointer, as -1…1 across the card.
    let px = 0;
    let py = 0;

    const clamp = (value: number) => Math.max(-1, Math.min(1, value));

    const write = () => {
      frame = 0;
      node.style.setProperty('--rx', `${(-py * maxDeg).toFixed(2)}deg`);
      node.style.setProperty('--ry', `${(px * maxDeg).toFixed(2)}deg`);
      node.style.setProperty('--gx', `${Math.round(((px + 1) / 2) * 100)}%`);
      node.style.setProperty('--gy', `${Math.round(((py + 1) / 2) * 100)}%`);
    };

    const onMove = (event: PointerEvent) => {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;

      px = clamp(((event.clientX - box.left) / box.width) * 2 - 1);
      py = clamp(((event.clientY - box.top) / box.height) * 2 - 1);

      if (!frame) frame = requestAnimationFrame(write);
    };

    const onLeave = () => {
      px = 0;
      py = 0;
      if (frame) cancelAnimationFrame(frame);
      node.style.setProperty('--rx', '0deg');
      node.style.setProperty('--ry', '0deg');
      node.style.setProperty('--gx', '50%');
      node.style.setProperty('--gy', '50%');
      frame = 0;
    };

    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerleave', onLeave);

    return () => {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [maxDeg]);

  return ref;
}
