'use client';

import { StudioImage } from '@/components/public/StudioImage';
import { cn } from '@/lib/cn';
import type { PublicClass } from '@/lib/public/api';
import { allocatePhotos } from '@/lib/public/photoBudget';
import { craftsIn, type StudioPhoto } from '@/lib/public/studioPhotos';

/**
 * "The crafts, up close" — two rows of photographs drifting past in
 * opposite directions, slowly enough to look at each one.
 *
 * The label says what they are: photographs of the crafts, not of this
 * studio's own sessions, so they are never called the studio's moments.
 *
 * Only photos of the crafts the studio has classes in, and only the ones the
 * photo budget still has uses left for once the fan, the chapters and the wall
 * have taken theirs — in practice a studio with all three crafts. With fewer
 * the strip would only replay what the page has already shown, so it does not
 * render. The second row is the
 * same set started from the other end and moving the other way, so the two
 * never line up; it is `aria-hidden` outright, because a screen reader should
 * hear each picture once, not twice.
 *
 * The loop is CSS: a track twice as long as it needs to be, moved by half its
 * length (`marquee` in globals.css), so the second half is exactly where the
 * first began and there is no seam to see. The set is repeated until one copy
 * is wider than any screen — with only four photos a single copy would leave a
 * gap before it wrapped.
 *
 * Hover pauses a row, so a picture someone is looking at holds still.
 *
 * The row is clipped (`overflow: clip`), so nothing can scroll it — it moves
 * only by its own animation. Under reduced motion there is no strip at all:
 * the photos wrap into a still gallery, each once, so there is no row wider
 * than the screen to scroll. That matters for more than looks: an earlier
 * version let the reduced-motion row scroll sideways (`overflow-x-auto`), and
 * axe rightly failed it — a scrollable region has to be reachable by keyboard,
 * and a still gallery needs no scrolling to begin with.
 */

/** The tallest a photo is drawn, in px. Used to estimate a copy's width. */
const ROW_HEIGHT_MAX = 210;
/** Wider than any screen this has to cover. */
const MIN_COPY_WIDTH = 2000;
const GAP = 16;

function repeatsToFill(photos: readonly StudioPhoto[]): number {
  const width = photos.reduce(
    (sum, item) => sum + (item.width / item.height) * ROW_HEIGHT_MAX + GAP,
    0,
  );

  return Math.max(1, Math.ceil(MIN_COPY_WIDTH / width));
}

function reordered(photos: readonly StudioPhoto[]): StudioPhoto[] {
  const half = Math.ceil(photos.length / 2);

  return [...photos.slice(half), ...photos.slice(0, half)].reverse();
}

export function PhotoMarquee({ classes }: { classes: PublicClass[] }) {
  // Whatever the fan, the chapters and the wall left — empty unless there is
  // enough for a strip worth looking at (`MARQUEE_MIN`).
  const photos = allocatePhotos(craftsIn(classes.map((item) => item.color_token))).marquee;

  if (photos.length === 0) return null;

  return (
    <section aria-label="The crafts, up close" className="overflow-hidden py-2">
      <p className="font-hand text-rose-ink px-4 text-center text-xl">the crafts, up close</p>

      <div className="mt-5 grid gap-4">
        <Row photos={photos} direction="fwd" />
        <Row photos={reordered(photos)} direction="rev" hidden />
      </div>
    </section>
  );
}

function Row({
  photos,
  direction,
  hidden,
}: {
  photos: StudioPhoto[];
  direction: 'fwd' | 'rev';
  hidden?: boolean;
}) {
  const copies = repeatsToFill(photos);

  return (
    <div
      aria-hidden={hidden || undefined}
      className={cn(
        'group overflow-clip',
        '[mask-image:linear-gradient(90deg,transparent,#000_7%,#000_93%,transparent)]',
        // The second row is a repeat; a still gallery needs one copy of each.
        hidden && 'motion-reduce:hidden',
      )}
    >
      <div
        className={cn(
          'flex w-max motion-reduce:w-auto motion-reduce:animate-none',
          'group-hover:[animation-play-state:paused]',
          direction === 'fwd' ? 'animate-strip-fwd' : 'animate-strip-rev',
        )}
      >
        {/* Two copies; the second is decoration. Each copy repeats the set
            enough times to be wider than the screen. */}
        <Track photos={photos} copies={copies} decorative={hidden} />
        <Track photos={photos} copies={copies} decorative />
      </div>
    </div>
  );
}

function Track({
  photos,
  copies,
  decorative,
}: {
  photos: StudioPhoto[];
  copies: number;
  decorative?: boolean;
}) {
  const sequence = Array.from({ length: copies }, () => photos).flat();

  return (
    <ul
      aria-hidden={decorative || undefined}
      className={cn(
        'flex shrink-0 gap-4 pr-4',
        // Still gallery: wrap, centred, and only the first copy.
        'motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:px-4',
        decorative && 'motion-reduce:hidden',
      )}
      // `list-style: none` strips list semantics in Safari; say it outright.
      role="list"
    >
      {sequence.map((photo, index) => {
        // Only the first run of photos is for a screen reader. Every repeat —
        // there to fill the width and to make the loop — is hidden one by one,
        // so the list it hears is the set, once.
        const announced = !decorative && index < photos.length;

        return (
          <li
            key={`${photo.id}-${index}`}
            aria-hidden={announced ? undefined : true}
            className={cn(
              'border-line h-[150px] shrink-0 overflow-hidden rounded-[var(--radius-md)] border-[1.5px] shadow-[var(--shadow-card)] sm:h-[210px]',
              // The repeats exist to fill the width and make the loop.
              index >= photos.length && 'motion-reduce:hidden',
            )}
            style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
          >
            <StudioImage
              photo={photo}
              alt={announced ? photo.alt : ''}
              sizes="320px"
              className="size-full object-cover"
            />
          </li>
        );
      })}
    </ul>
  );
}
