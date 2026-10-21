'use client';

import type { CSSProperties, JSX } from 'react';

import { cn } from '@/lib/cn';
import type { PublicClass } from '@/lib/public/api';
import { nextClass, whenCopy } from '@/lib/public/format';
import { scrollToId } from '@/lib/public/lenisBridge';
import { useMountedNow } from '@/lib/public/useMountedNow';
import { useStorefrontPosition } from '@/lib/public/useStorefrontPosition';

import '@/styles/units/nav.css';

/**
 * One floating glass pill for every width: the studio's name, the next class
 * in brief, and a clay "Save a seat".
 *
 * It appears once the hero has left the view (a pill on top of the hero would
 * say the same thing twice) and steps aside while the booking card is on
 * screen, where it would only sit on top of the fields being filled in.
 *
 * Phones: a bar along the bottom, clear of the home indicator. From `md`: a
 * rounded pill top-centre, 16px from the edge, whose name settles in from
 * large (nav.css). Glass for the surface and cocoa for the ink, the pairing
 * `glass.test.ts` measures; the button carries its own rose surface.
 */

const FOCUS = 'focus-visible:outline-[3px] focus-visible:outline-offset-2';

/** The seats, worded as the hero's next-class chip words them. */
function seatsCopy(item: PublicClass): string {
  if (item.is_full) return item.waitlist_is_open ? 'fully booked, waitlist open' : 'fully booked';
  return item.seats_left === 1 ? 'last seat' : `${item.seats_left} seats left`;
}

export function FloatingPill({
  studioName,
  classes = [],
}: {
  studioName?: string;
  classes?: PublicClass[];
}): JSX.Element | null {
  const { heroVisible, widgetVisible, footerVisible } = useStorefrontPosition();
  const now = useMountedNow();
  const soonest = nextClass(classes);

  if (heroVisible || widgetVisible || footerVisible) return null;

  return (
    <nav
      aria-label="Book a seat"
      data-floating-pill
      className={cn(
        'floating-pill fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3',
        'bg-[var(--glass-bg)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        'shadow-[inset_0_0_0_1px_var(--glass-border)] backdrop-blur-[var(--glass-blur)]',
        'md:inset-x-auto md:top-4 md:bottom-auto md:left-1/2 md:-translate-x-1/2',
        'md:rounded-[var(--radius-pill)] md:py-1.5 md:pr-1.5 md:pl-5',
      )}
    >
      {studioName ? (
        <span className="floating-pill__name font-display text-cocoa max-w-[14ch] truncate text-base font-semibold">
          {studioName}
        </span>
      ) : null}
      {soonest ? (
        <span className="floating-pill__next text-cocoa hidden text-sm whitespace-nowrap sm:inline">
          {now ? `${whenCopy(soonest.starts_at, now)} · ${seatsCopy(soonest)}` : ''}
        </span>
      ) : null}
      <a
        href="#booking-widget"
        style={{ '--clay-glow': 'var(--color-rose)' } as CSSProperties}
        onClick={(event) => {
          event.preventDefault();
          scrollToId('booking-widget');
        }}
        className={cn(
          'clay bg-rose text-on-rose ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-2',
          'rounded-[var(--radius-pill)] px-5 text-sm font-extrabold whitespace-nowrap',
          'focus-visible:outline-cocoa',
          FOCUS,
        )}
      >
        Save a seat
        <span aria-hidden="true">→</span>
      </a>
    </nav>
  );
}
