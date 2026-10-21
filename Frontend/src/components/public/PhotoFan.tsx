'use client';

import type { CSSProperties, RefObject } from 'react';

import { DragToss } from '@/components/public/hero/DragToss';
import { StudioImage } from '@/components/public/StudioImage';
import { cn } from '@/lib/cn';
import type { PublicClass } from '@/lib/public/api';
import { allocatePhotos } from '@/lib/public/photoBudget';
import { craftsIn, type StudioPhoto } from '@/lib/public/studioPhotos';
import { useHeroParallax } from '@/lib/public/useHeroParallax';

/**
 * Three polaroids fanned out under the hero's call to action — the first
 * thing on the page that shows what happens here rather than saying it.
 *
 * They are photos of the crafts the studio actually has classes in (cover of
 * each craft first, then more of the same), so the fan never advertises one it
 * does not run. The photo budget (`allocatePhotos`) picks them, so the rest of
 * the page knows what the fan has already shown.
 *
 * Three layers of motion, each answering to `prefers-reduced-motion`:
 *
 * - **Entrance.** Each drops in from above with a spring and settles at its
 *   own tilt, staggered, so the fan is dealt rather than switched on.
 * - **Depth.** The pointer moves the three by different amounts
 *   (`useHeroParallax` sets `--parallax-x/y` on the container; each polaroid
 *   multiplies them by its own `depth`) — the nearest drifts most, the middle
 *   least — so they read as separate cards at separate heights. Mouse only;
 *   a touch screen has no hover position.
 * - **Touch.** Hover, and a tap's `active`, straighten the card and lift it.
 *
 * The positioning, the pointer drift and the tilt are on three different
 * elements on purpose. A CSS `transform` replaces rather than adds, so putting
 * any two on one element would have each undo the other.
 */

interface Slot {
  /** Where it sits in the fan. Literal classes — Tailwind finds them by text. */
  place: string;
  tilt: number;
  /** How far the pointer moves it, as a multiple of the base offset. */
  depth: number;
  delayMs: number;
  /** Stacking: the middle card sits over its neighbours. */
  z: string;
  /** Washi tape, stuck on a little differently each time. */
  tape: string;
}

const SLOTS: readonly Slot[] = [
  {
    place: 'bottom-3 left-[2%] w-[132px] sm:left-[8%] sm:w-[188px]',
    tilt: -9,
    depth: 1.5,
    delayMs: 120,
    z: 'z-0',
    tape: 'bg-butter -top-2 left-4 -rotate-6',
  },
  {
    place: 'bottom-9 left-1/2 z-10 -ml-[78px] w-[156px] sm:-ml-[108px] sm:w-[216px]',
    tilt: 2,
    depth: 0.7,
    delayMs: 260,
    z: 'z-10',
    tape: 'bg-pink -top-2 left-1/2 -ml-8 rotate-2',
  },
  {
    place: 'right-[2%] bottom-0 w-[132px] sm:right-[8%] sm:w-[188px]',
    tilt: 9,
    depth: 2,
    delayMs: 400,
    z: 'z-0',
    tape: 'bg-sage -top-2 right-4 rotate-6',
  },
];

export function PhotoFan({ classes }: { classes: PublicClass[] }) {
  const parallaxRef = useHeroParallax<HTMLDivElement>(10);
  const photos = allocatePhotos(craftsIn(classes.map((item) => item.color_token))).fan;

  if (photos.length < SLOTS.length) return null;

  return (
    <div
      ref={parallaxRef}
      className="relative mx-auto mt-10 h-[270px] w-full max-w-[600px] sm:mt-12 sm:h-[345px]"
    >
      {SLOTS.map((slot, index) => (
        <Polaroid key={index} slot={slot} photo={photos[index]!} boundsRef={parallaxRef} />
      ))}
    </div>
  );
}

function Polaroid({
  slot,
  photo,
  boundsRef,
}: {
  slot: Slot;
  photo: StudioPhoto;
  boundsRef: RefObject<HTMLElement | null>;
}) {
  return (
    // Outer: where it sits, and what a guest's flick moves (`DragToss`). Middle: how far the
    // pointer pushes it. Inner: its tilt, its entrance and its hover.
    <DragToss boundsRef={boundsRef} className={cn('absolute', slot.place, slot.z)}>
      <div
        style={{
          transform: `translate3d(calc(var(--parallax-x, 0px) * ${slot.depth}), calc(var(--parallax-y, 0px) * ${slot.depth}), 0)`,
        }}
      >
        <figure
          data-cursor-label="HELLO"
          className={cn(
            'animate-polaroid-in border-line bg-paper relative rounded-[6px] border p-2 pb-9',
            'shadow-[var(--shadow-lift)] transition-[transform,box-shadow] duration-300',
            '[transform:rotate(var(--tilt))] hover:[transform:rotate(0deg)_scale(1.07)]',
            'active:[transform:rotate(0deg)_scale(1.04)]',
            'motion-reduce:transition-none',
          )}
          style={
            { '--tilt': `${slot.tilt}deg`, animationDelay: `${slot.delayMs}ms` } as CSSProperties
          }
        >
          <span
            aria-hidden="true"
            className={cn('absolute h-[18px] w-[64px] rounded-[3px] opacity-85', slot.tape)}
          />
          <div className="aspect-[4/5] overflow-hidden rounded-[3px]">
            <StudioImage
              photo={photo}
              sizes="(min-width: 640px) 216px, 156px"
              eager
              className="size-full object-cover"
            />
          </div>
          <figcaption className="font-hand text-cocoa absolute inset-x-0 bottom-1.5 text-center text-lg leading-none">
            {photo.caption}
          </figcaption>
        </figure>
      </div>
    </DragToss>
  );
}
