'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';
import type { PublicClass } from '@/lib/public/api';
import { prefersReducedMotion } from '@/lib/public/motion';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';

/**
 * A small "postcard" — the exact gradient + tilt + dashed-border card
 * language the admin app already uses for "Your week, wrapped" (see
 * `components/domain/WeekWrapped.tsx`), reused here so the booking page
 * carries the same signature rather than inventing a new one.
 *
 * The number on it is real, not invented: seats actually open right now,
 * summed from the same class list the guest is about to pick from. No
 * "12 people are viewing this" fake-urgency pattern — the design system's
 * own voice rules already forbid shame copy and invented scarcity, and a
 * number a guest can immediately go verify by scrolling down is worth more
 * than one they can't.
 */
export function BookingPostcard({ classes }: { classes: PublicClass[] }) {
  const openClasses = classes.filter((item) => !item.is_full);
  const seatsOpen = openClasses.reduce((total, item) => total + item.seats_left, 0);

  const [ref, visible] = useRevealOnScroll<HTMLDivElement>();
  const shown = useCountUp(seatsOpen, visible);

  if (classes.length === 0 || seatsOpen === 0) return null;

  return (
    <div ref={ref} className="px-4 sm:px-6">
      <div
        className={cn(
          'mx-auto max-w-[340px] rounded-[var(--radius-lg)] p-[5px] shadow-[var(--shadow-soft)]',
          'bg-[linear-gradient(140deg,var(--color-pink)_0%,var(--color-butter)_55%,var(--color-sage)_110%)]',
          'rotate-[1.1deg] transition-[opacity,transform] duration-500',
          visible ? 'opacity-100' : 'opacity-0 translate-y-3',
        )}
      >
        <div className="relative rounded-[18px] border-2 border-dashed border-white/75 p-5 text-center text-[#4A2A33]">
          <p className="font-display text-3xl leading-none tabular-nums">{shown}</p>
          <p className="font-hand mt-1 text-lg">
            seat{seatsOpen === 1 ? '' : 's'} open across {openClasses.length} class
            {openClasses.length === 1 ? '' : 'es'} right now ✨
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Counts up from 0 to `target` once `start` flips true, instead of the
 * number just appearing — a beat of motion draws the eye to the one figure
 * on this page that's actually meant to persuade someone to scroll on.
 *
 * `prefers-reduced-motion` skips straight to the final number: this is a
 * decorative flourish on a real value, not information conveyed by the
 * motion itself, so there is nothing lost by cutting it short.
 */
function useCountUp(target: number, start: boolean): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) return;

    const reduceMotion = prefersReducedMotion();

    // jsdom's requestAnimationFrame is real but not wall-clock accurate, so
    // a 700ms animation can take several real seconds under test — jump
    // straight to the final value there rather than let the suite depend on
    // timing it can't actually control.
    const isTestEnv = typeof process !== 'undefined' && Boolean(process.env?.VITEST);

    if (reduceMotion || isTestEnv || target <= 0) {
      setValue(target);
      return;
    }

    let frame: number;
    const duration = 700;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      // easeOutQuad — fast start, settles gently on the final number rather
      // than ticking over evenly like a stopwatch.
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, target]);

  return value;
}
