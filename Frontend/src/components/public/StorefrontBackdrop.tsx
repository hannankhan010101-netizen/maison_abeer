'use client';

import type { CSSProperties } from 'react';

import { cn } from '@/lib/cn';
import { useScrollDrift } from '@/lib/public/useScrollDrift';

/**
 * The storefront's background — the whole page, behind everything.
 *
 * Fixed to the viewport, so it is the same sheet of paper under the hero,
 * the chapters and the booking card, rather than each section painting its
 * own. Four layers, back to front:
 *
 * 1. **Washes.** Four large, soft discs of the palette — blush, butter, sage,
 *    terracotta — each drifting on its own slow loop (`drift`), and each
 *    easing upward a little as the page scrolls, by a different amount, so
 *    they read as lying at different depths. They are radial gradients, not
 *    blurred elements: a `filter: blur()` on something this large is repainted
 *    every frame it moves, a gradient is painted once and only translated.
 * 2. **Confetti.** A tiled pattern of hand-drawn sprinkles, stars, hearts and
 *    rings, sliding at a slower pace than the page so it sits behind glass.
 *    The slide wraps every tile (`mod()`), so it never runs off the end, and
 *    the layer overhangs the viewport by one tile top and bottom so the wrap
 *    is invisible.
 * 3. **Sparkles.** A handful of small gold stars catching the light.
 * 4. **Grain.** The same paper texture every surface on the page already uses.
 *
 * The page's text sits on `--color-buttercream` and the washes are the
 * palette's own soft fills, so nothing here changes a contrast pair that
 * `contrast.test.ts` has not already measured. Everything is decoration:
 * `aria-hidden`, `pointer-events: none`, and under reduced motion the washes
 * stop at their resting point, the confetti holds still (`--scroll-y` is
 * never set — see `useScrollDrift`) and the sparkles glow faintly.
 *
 * It lives at `z-index: -1` inside `main`, which is `isolate` for exactly
 * this reason: without that stacking context a negative z-index would put it
 * underneath `main`'s own background, where nobody would ever see it.
 */

interface Wash {
  /** Where the disc sits. Literal classes — Tailwind finds them by text. */
  place: string;
  tint: string;
  /** Fraction of the scroll it eases upward by. */
  speed: number;
  delay: string;
}

const WASHES: readonly Wash[] = [
  {
    place: '-top-[14%] -left-[12%] size-[72vw] max-w-[860px]',
    tint: 'bg-[radial-gradient(closest-side,var(--color-blush),transparent_72%)]',
    speed: 0.05,
    delay: '0s',
  },
  {
    place: 'top-[16%] -right-[18%] size-[64vw] max-w-[780px]',
    tint: 'bg-[radial-gradient(closest-side,var(--color-butter-soft),transparent_72%)]',
    speed: 0.08,
    delay: '5s',
  },
  {
    place: 'top-[56%] -left-[20%] size-[68vw] max-w-[800px]',
    tint: 'bg-[radial-gradient(closest-side,var(--color-sage-soft),transparent_72%)]',
    speed: 0.03,
    delay: '9s',
  },
  {
    place: '-bottom-[16%] right-[2%] size-[56vw] max-w-[680px] opacity-80',
    tint: 'bg-[radial-gradient(closest-side,var(--color-terra-soft),transparent_72%)]',
    speed: 0.06,
    delay: '3s',
  },
];

/**
 * One tile of confetti. Light-palette literals: a data URI cannot read a
 * custom property, and this page is pinned to the light palette anyway.
 *
 * Large and sparse, with nothing on a grid line: a small tile repeats often
 * enough that the eye finds the rows, and then it is wallpaper. At 440px with
 * fourteen pieces scattered off-centre the repeat is wider than most phones
 * and the eye reads it as thrown, not printed.
 */
const CONFETTI_TILE = 440;

const CONFETTI_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='${CONFETTI_TILE}' height='${CONFETTI_TILE}' viewBox='0 0 440 440'>
  <g opacity='.5'>
    <rect x='31' y='47' width='16' height='5' rx='2.5' fill='#f2aabe' transform='rotate(-28 39 49)'/>
    <rect x='233' y='23' width='14' height='5' rx='2.5' fill='#adbe93' transform='rotate(35 240 25)'/>
    <rect x='389' y='131' width='16' height='5' rx='2.5' fill='#f7dc94' transform='rotate(-60 397 133)'/>
    <rect x='97' y='262' width='14' height='5' rx='2.5' fill='#c96f4a' transform='rotate(20 104 264)'/>
    <rect x='311' y='347' width='16' height='5' rx='2.5' fill='#f2aabe' transform='rotate(-45 319 349)'/>
    <rect x='41' y='393' width='14' height='5' rx='2.5' fill='#adbe93' transform='rotate(60 48 395)'/>
    <rect x='207' y='187' width='15' height='5' rx='2.5' fill='#e2849e' transform='rotate(12 214 189)'/>
    <circle cx='163' cy='109' r='3' fill='#e2849e'/>
    <circle cx='402' cy='263' r='2.5' fill='#f7dc94'/>
    <circle cx='281' cy='113' r='4' fill='none' stroke='#e2849e' stroke-width='1.6'/>
    <circle cx='59' cy='181' r='4' fill='none' stroke='#adbe93' stroke-width='1.6'/>
    <circle cx='349' cy='421' r='2' fill='#c96f4a'/>
    <path d='M333 201c2 7 5 10 12 12-7 2-10 5-12 12-2-7-5-10-12-12 7-2 10-5 12-12z' fill='#f7dc94'/>
    <path d='M139 353c2 7 5 10 12 12-7 2-10 5-12 12-2-7-5-10-12-12 7-2 10-5 12-12z' fill='#f2aabe'/>
    <path d='M421 59c-5-4-9-8-9-12a5 5 0 0 1 9-2 5 5 0 0 1 9 2c0 4-4 8-9 12z' fill='#e2849e'/>
    <path d='M191 302c-5-4-9-8-9-12a5 5 0 0 1 9-2 5 5 0 0 1 9 2c0 4-4 8-9 12z' fill='#f7dc94'/>
  </g>
</svg>`;

const CONFETTI_URL = `url("data:image/svg+xml,${encodeURIComponent(CONFETTI_SVG.replace(/\s+/g, ' ').trim())}")`;

/** Where the sparkles sit, and how they differ, so no two blink together. */
const SPARKLES = [
  { place: 'top-[11%] left-[7%] w-5', delay: '0s' },
  { place: 'top-[6%] right-[12%] w-3.5', delay: '0.7s' },
  { place: 'top-[38%] right-[6%] w-6', delay: '1.4s' },
  { place: 'top-[52%] left-[4%] w-4 hidden sm:block', delay: '2.1s' },
  { place: 'top-[72%] right-[22%] w-3 hidden sm:block', delay: '0.4s' },
  { place: 'bottom-[8%] left-[14%] w-5', delay: '1.8s' },
] as const;

export function StorefrontBackdrop() {
  const ref = useScrollDrift<HTMLDivElement>();

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-storefront-backdrop
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {WASHES.map((wash, index) => (
        // Outer: eased upward by scroll, never past a fifth of the screen, so
        // a long page does not scroll the washes clean out of view. Inner:
        // the slow loop. Two elements because a `transform` replaces rather
        // than adds, and each needs its own.
        <div
          key={index}
          data-wash
          className={cn('absolute', wash.place)}
          style={{
            transform: `translate3d(0, max(-22vh, calc(var(--scroll-y, 0px) * -${wash.speed})), 0)`,
          }}
        >
          <div
            className={cn('animate-drift size-full rounded-full', wash.tint)}
            style={{ animationDelay: wash.delay, animationDuration: '22s' }}
          />
        </div>
      ))}

      <div
        data-confetti
        className="absolute inset-x-0 opacity-65"
        style={{
          top: -CONFETTI_TILE,
          bottom: -CONFETTI_TILE,
          backgroundImage: CONFETTI_URL,
          backgroundSize: `${CONFETTI_TILE}px ${CONFETTI_TILE}px`,
          transform: `translate3d(0, calc(-1 * mod(calc(var(--scroll-y, 0px) * 0.12), ${CONFETTI_TILE}px)), 0)`,
        }}
      />

      {SPARKLES.map((sparkle, index) => (
        <Sparkle key={index} className={sparkle.place} style={{ animationDelay: sparkle.delay }} />
      ))}

      <div className="grain-overlay absolute inset-0" />
    </div>
  );
}

/** A small gold star, lit from within. */
function Sparkle({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(
        'animate-twinkle text-butter absolute drop-shadow-[0_0_6px_rgb(247_220_148_/85%)]',
        className,
      )}
      style={style}
    >
      <path
        d="M12 1c1 7 4 10 11 11-7 1-10 4-11 11-1-7-4-10-11-11 7-1 10-4 11-11Z"
        fill="currentColor"
      />
    </svg>
  );
}
