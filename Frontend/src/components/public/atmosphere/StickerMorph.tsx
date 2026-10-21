'use client';

import { useEffect, useRef, type JSX } from 'react';

import { cn } from '@/lib/cn';
import { loadGsap } from '@/lib/motion/gsap';
import { useMayAnimate } from '@/lib/public/useMayAnimate';

/**
 * One sticker that turns into the craft the guest is reading about.
 *
 * It is a single outline path. As the chapters scroll past, GSAP's MorphSVG
 * redraws that one path as a cake, a pot or a palette, whichever chapter is
 * most in view. The morph is decoration on top of a complete picture: the
 * first frame (the cake) is what renders on the server, under reduced motion,
 * and when the GSAP kit cannot be loaded. Only `d` changes; nothing is laid
 * out again.
 *
 * Chapters announce themselves with `data-craft-chapter="<craft kind>"`; this
 * component looks them up in the document rather than being told, so it can
 * sit in the chapters' header without the header knowing about the articles.
 */

export const STICKER_PATHS = {
  cake: 'M16 52 Q16 42 44 42 Q44 28 50 26 Q56 28 56 42 Q84 42 84 52 L84 78 Q84 88 50 88 Q16 88 16 78 Z',
  pot: 'M38 22 Q36 30 40 36 Q20 46 24 66 Q28 88 50 88 Q72 88 76 66 Q80 46 60 36 Q64 30 62 22 Z',
  palette:
    'M46 14 C70 14 86 28 86 46 C86 56 78 60 70 59 C62 58 58 63 61 70 C64 77 58 86 46 86 C25 86 10 70 10 50 C10 30 24 14 46 14 Z',
} as const;

const SHAPE_FOR_KIND: Record<string, keyof typeof STICKER_PATHS> = {
  cake: 'cake',
  pottery: 'pot',
  painting: 'palette',
};

export function StickerMorph(p: { className?: string }): JSX.Element {
  const pathRef = useRef<SVGPathElement>(null);
  const mayAnimate = useMayAnimate();

  useEffect(() => {
    if (!mayAnimate) return;

    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    void loadGsap('MorphSVGPlugin').then((kit) => {
      const path = pathRef.current;
      if (cancelled || !kit || !path || typeof IntersectionObserver !== 'function') return;

      const chapters = document.querySelectorAll<HTMLElement>('[data-craft-chapter]');
      let shown: keyof typeof STICKER_PATHS = 'cake';

      observer = new IntersectionObserver(
        (entries) => {
          // The most visible chapter among those that just reported wins.
          const best = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          const kind = (best?.target as HTMLElement | undefined)?.dataset.craftChapter;
          const next = kind ? SHAPE_FOR_KIND[kind] : undefined;
          if (!next || next === shown) return;

          shown = next;
          kit.gsap.to(path, { morphSVG: STICKER_PATHS[next], duration: 0.9, ease: 'power2.inOut' });
        },
        { threshold: [0.3, 0.6] },
      );
      chapters.forEach((chapter) => observer!.observe(chapter));
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [mayAnimate]);

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      className={cn('overflow-visible drop-shadow-[0_10px_16px_rgb(64_48_42_/18%)]', p.className)}
    >
      <path
        ref={pathRef}
        d={STICKER_PATHS.cake}
        fill="var(--color-blush)"
        stroke="var(--color-cocoa)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
