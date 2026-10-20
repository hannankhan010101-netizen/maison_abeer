import { useEffect, useRef } from 'react';

import { loadGsap } from '@/lib/motion/gsap';
import { useMayAnimate } from '@/lib/public/useMayAnimate';

/**
 * A photo that drifts inside its frame as the page scrolls past it — the
 * frame stays put, the picture moves a little slower than the page, and the
 * eye reads depth.
 *
 * GSAP's ScrollTrigger with `scrub`, tying the picture's position to scroll
 * progress rather than to time. Only `transform` is animated, so it runs on
 * the compositor and never forces layout.
 *
 * The library comes in through `loadGsap` (`lib/motion`), after mount, as its
 * own chunk: this is decoration, and a page whose job is a fast booking form
 * for someone on mobile data does not wait on an animation library to be
 * useful. Under `useMayAnimate`'s three vetoes the effect never runs and the
 * module is never fetched, and if it fails to load the picture is simply a
 * picture.
 *
 * The image must be taller than its frame, by more than `range` on each side,
 * or the drift would uncover an edge. `CraftChapters` sizes it to 116% with a
 * `range` of 7.
 *
 * The trigger is the nearest ancestor marked `data-parallax-frame`, else the
 * image's parent.
 */
export function useScrollParallax<T extends HTMLElement>(range = 7) {
  const ref = useRef<T | null>(null);
  const mayAnimate = useMayAnimate();

  useEffect(() => {
    const node = ref.current;
    if (!node || !mayAnimate) return;

    let cancelled = false;
    let teardown: (() => void) | undefined;

    loadGsap('ScrollTrigger').then((kit) => {
      // Cancelled while loading, or the library never arrived: leave the
      // picture as a picture.
      if (cancelled || !kit) return;

      const { gsap } = kit;
      const frame = node.closest<HTMLElement>('[data-parallax-frame]') ?? node.parentElement;
      if (!frame) return;

      const tween = gsap.fromTo(
        node,
        { yPercent: -range },
        {
          yPercent: range,
          ease: 'none',
          scrollTrigger: {
            trigger: frame,
            start: 'top bottom',
            end: 'bottom top',
            // A touch of lag on the scrub: the picture eases toward where
            // the scroll says it should be instead of being bolted to it.
            scrub: 0.6,
          },
        },
      );

      teardown = () => {
        tween.scrollTrigger?.kill();
        tween.kill();
        gsap.set(node, { clearProps: 'transform' });
      };
    });

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [mayAnimate, range]);

  return ref;
}
