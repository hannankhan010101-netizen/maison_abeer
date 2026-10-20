import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Hand-drawn craft stickers — the storefront's illustration set.
 *
 * Inline SVG rather than image files for the same reason the hero never
 * used stock photography: this app owns no imagery, and a sticker drawn in
 * the studio's own tokens is on-brand on every studio's page, including one
 * whose Brand Kit recolours rose and pink (the fills read the same custom
 * properties every other surface does). They replace the 3D polyhedra that
 * used to float behind the headline — abstract shapes read as "a tech
 * landing page", a frosted cake and a thrown pot read as "this is where you
 * make one".
 *
 * Decorative throughout: every sticker is `aria-hidden`, nothing the page
 * says depends on one, and the one that bobs is also the one that sits
 * still under reduced motion (see `float` in globals.css).
 */

export interface StickerProps {
  className?: string;
  style?: CSSProperties;
}

const INK = {
  stroke: 'var(--color-cocoa)',
  strokeWidth: 2.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Sticker({ className, style, children }: StickerProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      className={cn('overflow-visible drop-shadow-[0_10px_16px_rgb(64_48_42_/18%)]', className)}
      style={style}
    >
      {children}
    </svg>
  );
}

/** A small round cake, frosting dripping over the edge, cherry on top. */
export function StickerCake(props: StickerProps) {
  return (
    <Sticker {...props}>
      <ellipse cx="50" cy="80" rx="34" ry="8" fill="var(--color-paper)" {...INK} />
      <path d="M22 50v22c0 5 12 9 28 9s28-4 28-9V50" fill="var(--color-blush)" {...INK} />
      <ellipse cx="50" cy="50" rx="28" ry="10" fill="var(--color-pink)" {...INK} />
      <path
        d="M26 55c0 7 3 9 5 9s4-3 4-7M40 59c0 8 3 10 5 10s4-3 4-8M58 58c0 8 3 10 5 10s4-3 4-8"
        fill="none"
        stroke="var(--color-rose)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M52 42c1-7 4-11 10-13" fill="none" {...INK} />
      <circle cx="51" cy="43" r="6" fill="var(--color-rose-deep)" {...INK} />
      <path
        d="M34 47l4-2M62 46l4 2M44 53l3 2M70 52l3-2"
        stroke="var(--color-sage-ink)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </Sticker>
  );
}

/** A wheel-thrown pot, two throwing lines still on it, on its bat. */
export function StickerPot(props: StickerProps) {
  return (
    <Sticker {...props}>
      <ellipse cx="50" cy="86" rx="30" ry="7" fill="var(--color-terra-soft)" {...INK} />
      <path
        d="M37 24c-3 6-3 11 2 14-10 5-16 15-13 27 3 13 13 21 24 21s21-8 24-21c3-12-3-22-13-27 5-3 5-8 2-14Z"
        fill="var(--color-terra)"
        {...INK}
      />
      <ellipse cx="50" cy="24" rx="13" ry="4.5" fill="var(--color-terra-soft)" {...INK} />
      <path
        d="M31 56c12 5 26 5 38 0M33 67c11 4 23 4 34 0"
        fill="none"
        stroke="var(--color-terra-deep)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </Sticker>
  );
}

/** A painter's palette with four daubs and a brush resting across it. */
export function StickerPalette(props: StickerProps) {
  return (
    <Sticker {...props}>
      <path
        d="M46 14c24 0 40 15 40 32 0 10-8 14-16 13-8-1-12 4-9 11 3 7-3 16-15 16C25 86 10 70 10 50S24 14 46 14Z"
        fill="var(--color-paper)"
        {...INK}
      />
      <circle cx="30" cy="38" r="6.5" fill="var(--color-pink)" />
      <circle cx="47" cy="29" r="6.5" fill="var(--color-sage)" />
      <circle cx="65" cy="36" r="6.5" fill="var(--color-butter)" />
      <circle cx="27" cy="58" r="6.5" fill="var(--color-terra)" />
      <path d="M58 92L84 46" stroke="var(--color-cocoa)" strokeWidth="6" strokeLinecap="round" />
      <path d="M82 48l5-14 6 10-7 8Z" fill="var(--color-rose)" {...INK} />
    </Sticker>
  );
}

/** A four-point sparkle. */
export function StickerSpark(props: StickerProps) {
  return (
    <Sticker {...props}>
      <path
        d="M50 6c4 28 16 40 44 44-28 4-40 16-44 44-4-28-16-40-44-44 28-4 40-16 44-44Z"
        fill="var(--color-butter)"
        {...INK}
      />
    </Sticker>
  );
}

/** A small heart, the studio's own sign-off. */
export function StickerHeart(props: StickerProps) {
  return (
    <Sticker {...props}>
      <path
        d="M50 88S12 64 12 38a19 19 0 0 1 38-6 19 19 0 0 1 38 6c0 26-38 50-38 50Z"
        fill="var(--color-blush)"
        stroke="var(--color-rose-deep)"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </Sticker>
  );
}
