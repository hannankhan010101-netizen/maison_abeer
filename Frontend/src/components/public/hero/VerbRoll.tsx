'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';
import { FALLBACK_VERB } from '@/lib/public/craftVerbs';
import { useMayAnimate } from '@/lib/public/useMayAnimate';

/**
 * The hero's rolling verb: "come **throw** something with your own hands".
 *
 * Every verb sits in the same grid cell, so the box is as wide as the widest
 * verb and the sentence around it never shifts as the words change. The motion
 * itself is CSS (`hero.css`, `.verb-roll`): this only says which verb is
 * active and which is leaving.
 *
 * It is decoration. The whole thing is `aria-hidden`; the sentence a screen
 * reader hears is a visually hidden copy beside it, so there is no live region
 * announcing a new word every 2.6 seconds. It stops while the tab is hidden and
 * while a pointer rests on it, and under reduced motion or Data Saver it is
 * just the first verb, standing still.
 */
export function VerbRoll({
  verbs,
  intervalMs = 2600,
  className,
}: {
  verbs: readonly string[];
  intervalMs?: number;
  className?: string;
}) {
  const mayAnimate = useMayAnimate();
  const [{ active, leaving }, setRoll] = useState<{ active: number; leaving: number | null }>({
    active: 0,
    leaving: null,
  });
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);

  const list = verbs.length > 0 ? verbs : [FALLBACK_VERB];
  const rolls = mayAnimate && list.length > 1;

  useEffect(() => {
    if (!rolls) return;
    const update = () => setVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [rolls]);

  useEffect(() => {
    if (!rolls || hovered || !visible) return;
    const id = window.setInterval(() => {
      setRoll(({ active: current }) => ({
        active: (current + 1) % list.length,
        leaving: current,
      }));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [rolls, hovered, visible, intervalMs, list.length]);

  const shown = rolls ? list : list.slice(0, 1);

  return (
    <span
      aria-hidden="true"
      className={cn('verb-roll inline-grid', className)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {shown.map((word, index) => (
        <span
          key={word}
          data-verb=""
          data-active={!rolls || index === active ? '' : undefined}
          data-leaving={rolls && index === leaving && index !== active ? '' : undefined}
          className="[grid-area:1/1]"
        >
          {word}
        </span>
      ))}
      {/* The handwritten underline, in its own reserved row so it never
          changes the line's height. Keyed on the active verb: each change
          remounts it, which restarts the CSS draw-in (`hero.css`). */}
      <svg
        key={rolls ? active : 'still'}
        aria-hidden="true"
        viewBox="0 0 120 8"
        preserveAspectRatio="none"
        fill="none"
        className="block h-full w-full [grid-area:2/1]"
      >
        <path
          className="verb-underline"
          d="M2 5.2C20 2.6 34 6.4 52 4.6S86 2.4 100 4.4 112 5.6 118 3.6"
          pathLength={1}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}
