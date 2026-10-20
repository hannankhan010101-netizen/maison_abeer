'use client';

import { useEffect, useRef, type JSX, type ReactNode, type RefObject } from 'react';

import { cn } from '@/lib/cn';
import { loadGsap } from '@/lib/motion/gsap';
import { useMayAnimate } from '@/lib/public/useMayAnimate';

/**
 * Makes whatever it wraps something a guest can flick across the hero and let go
 * of, so it glides to a stop.
 *
 * It is decoration on a card that is already there. The library loads after
 * mount, only when motion is allowed, and if it never arrives (`loadGsap`
 * resolves `null`) the wrapper is just a `div` and the card sits where it was
 * dealt.
 *
 * Two things keep it from costing a phone its scrolling. `touch-action: pan-y`
 * tells the browser the page owns vertical swipes that start on the card, and
 * is put back after Draggable (which would set `none`) has attached; a
 * sideways flick still moves the card. `dragClickables: false` leaves links and
 * buttons inside it as ordinary taps.
 *
 * The element Draggable moves is this wrapper, and the caller puts it outside
 * the transforms it already has (placement, pointer drift, tilt), because a CSS
 * `transform` replaces rather than adds.
 */

/** Rises with every press, so the card picked up last is always on top. */
let frontmost = 20;

export interface DragTossProps {
  children: ReactNode;
  /** The box the card may be thrown around inside. */
  boundsRef: RefObject<HTMLElement | null>;
  className?: string;
}

export function DragToss({ children, boundsRef, className }: DragTossProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const mayAnimate = useMayAnimate();

  useEffect(() => {
    if (!mayAnimate) return;

    let cancelled = false;
    let instances: { kill: () => void }[] = [];

    void loadGsap('Draggable', 'InertiaPlugin').then((kit) => {
      const node = ref.current;
      if (cancelled || !kit || !node) return;

      instances = kit.Draggable.create(node, {
        type: 'x,y',
        inertia: true,
        bounds: boundsRef.current ?? undefined,
        edgeResistance: 0.85,
        allowNativeTouchScrolling: true,
        dragClickables: false,
        // With both axes free, Draggable calls preventDefault on every touch move, which kills
        // the page's vertical scroll whatever `touch-action` says. `touch-action: pan-y` (below)
        // is what decides who owns a swipe, so Draggable is told to leave the events alone.
        allowEventDefault: true,
        onPress: () => {
          frontmost += 1;
          kit.gsap.set(node, { zIndex: frontmost });
        },
      });

      // Draggable ignores `allowNativeTouchScrolling` when it drags on both axes, and writes
      // `touch-action: none` onto the element and every descendant, which would hand it every
      // swipe. Taking those back is what lets a vertical swipe scroll the page: the browser
      // pans, Draggable sees the pointer cancelled and lets go, and a sideways flick (which
      // `pan-y` leaves to the page's script) still moves the card.
      for (const target of [node, ...node.querySelectorAll<HTMLElement>('*')]) {
        target.style.touchAction = 'pan-y';
      }
    });

    return () => {
      cancelled = true;
      instances.forEach((instance) => instance.kill());
      instances = [];
    };
  }, [mayAnimate, boundsRef]);

  return (
    <div ref={ref} data-dragtoss className={cn(className)} style={{ touchAction: 'pan-y' }}>
      {children}
    </div>
  );
}
