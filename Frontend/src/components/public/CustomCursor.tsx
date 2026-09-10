'use client';

import { useEffect, useRef } from 'react';

import { prefersReducedMotion } from '@/lib/public/motion';

/**
 * A small ring that follows the pointer with a beat of lag, expanding and
 * picking up a word ("EXPLORE", "BOOK") over any element carrying a
 * `data-cursor-label` attribute — the interface acknowledging a hand is
 * actually reaching for something, rather than a hitbox with `:hover`.
 *
 * Desktop-with-a-mouse only: never rendered on a touch device (there is no
 * cursor to replace) and never under `prefers-reduced-motion`. It is purely
 * decorative and `pointer-events: none` throughout — the real cursor stays
 * exactly where it is underneath, so nothing here can block a click, steal
 * focus, or affect keyboard navigation. Screen readers never see it: it
 * carries no role and no text a click target doesn't already have on its
 * own via that element's own accessible name.
 */
export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(pointer: fine)').matches) return;

    const ring = ringRef.current;
    const label = labelRef.current;
    if (!ring || !label) return;

    document.body.classList.add('cursor-none');

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let x = targetX;
    let y = targetY;
    let currentLabel = '';
    let frame: number;

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    const onLeave = () => {
      ring.style.opacity = '0';
    };
    const onEnter = () => {
      ring.style.opacity = '1';
    };
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);

    const tick = () => {
      frame = requestAnimationFrame(tick);

      x += (targetX - x) * 0.22;
      y += (targetY - y) * 0.22;
      ring.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;

      const hovered = document.elementFromPoint(targetX, targetY)?.closest<HTMLElement>('[data-cursor-label]');
      const nextLabel = hovered?.dataset.cursorLabel ?? '';
      if (nextLabel !== currentLabel) {
        currentLabel = nextLabel;
        label.textContent = nextLabel;
        ring.dataset.expanded = nextLabel ? 'true' : 'false';
      }
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      document.body.classList.remove('cursor-none');
    };
  }, []);

  return (
    <div
      ref={ringRef}
      aria-hidden="true"
      className={[
        'pointer-events-none fixed top-0 left-0 z-50 flex items-center justify-center rounded-full',
        'border-[1.5px] border-cocoa/70 bg-paper/10 opacity-0',
        'size-8 transition-[width,height,opacity] duration-200 ease-out',
        'data-[expanded=true]:size-16 data-[expanded=true]:bg-paper/90 data-[expanded=true]:border-transparent',
      ].join(' ')}
    >
      <span ref={labelRef} className="text-cocoa text-[10px] font-extrabold tracking-wide" />
    </div>
  );
}
