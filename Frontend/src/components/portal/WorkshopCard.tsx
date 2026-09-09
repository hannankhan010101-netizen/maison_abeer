'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Chip } from '@/components/ui/Chip';
import { cn } from '@/lib/cn';
import { formatDateLong, formatRange } from '@/lib/dates';
import type { PortalWorkshop, WorkshopStatus } from '@/lib/api/types';

/**
 * One workshop on a guest's list.
 *
 * The countdown ticks rather than being computed once, because "starts in 2
 * days" quietly becoming wrong while a phone sits on a table is exactly the
 * kind of small lie that makes an app feel dead.
 */

const STATUS: Record<
  WorkshopStatus,
  { label: string; tone: 'pink' | 'sage' | 'butter' | 'neutral' }
> = {
  upcoming: { label: 'Upcoming', tone: 'pink' },
  live: { label: 'Happening now', tone: 'sage' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'butter' },
  // Not a seat — a place in a queue. Distinct from "Upcoming" so nobody turns
  // up to a class they are only waiting for.
  waitlisted: { label: 'On the waitlist', tone: 'butter' },
  // A seat is being held, not yet claimed — the most urgent state a card can
  // be in, so it gets the same tone as "happening now".
  invited: { label: 'Seat held for you', tone: 'sage' },
};

/**
 * Countdown copy with a bit of heat behind it.
 *
 * Deliberately coarse above a day — a guest wants to know roughly how long,
 * not a ticking clock they feel obliged to watch. Under an hour it gets
 * precise, because that is when precision actually helps.
 */
export function countdownFrom(startsAt: string, now: Date): string {
  const diff = new Date(startsAt).getTime() - now.getTime();

  if (diff <= 0) return 'Starting now';

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 2) return `Starts in ${days} days`;
  if (days === 1) return 'Starts tomorrow 🔥';
  if (hours >= 2) return `Starts in ${hours} hours 🔥`;
  if (hours === 1) return 'Starts in an hour 🔥';
  if (minutes >= 2) return `Starts in ${minutes} minutes 🔥`;

  return 'Starting any minute 🔥';
}

/** Ticks once a minute — enough for this copy, and cheap. */
function useTickingNow(active: boolean): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Null until mounted: rendering a clock on the server and again on the
    // client is a hydration mismatch waiting to happen.
    setNow(new Date());

    if (!active) return;

    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [active]);

  return now;
}

export interface WorkshopCardProps {
  workshop: PortalWorkshop;
}

export function WorkshopCard({ workshop }: WorkshopCardProps) {
  const status = STATUS[workshop.status];
  const now = useTickingNow(workshop.status === 'upcoming');

  return (
    <Link
      href={`/portal/workshops/${workshop.session_id}`}
      className={cn(
        'border-line bg-paper block rounded-[var(--radius-lg)] border-[1.5px] p-4',
        'min-h-[44px] transition-transform',
        'hover:border-rose hover:-translate-y-0.5 motion-reduce:transform-none',
        'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-display text-lg leading-tight">{workshop.name}</span>
        <Chip tone={status.tone}>{status.label}</Chip>
      </div>

      {/* suppressHydrationWarning: formatted in the visitor's locale, which
          the server cannot know. */}
      <p className="text-cocoa mt-1 text-sm" suppressHydrationWarning>
        {formatDateLong(workshop.starts_at)} · {formatRange(workshop.starts_at, workshop.ends_at)}
      </p>

      {workshop.location ? <p className="text-latte text-sm">{workshop.location}</p> : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {workshop.status === 'upcoming' && now ? (
          <span
            className="bg-blush text-rose-ink rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-extrabold"
            suppressHydrationWarning
          >
            {countdownFrom(workshop.starts_at, now)}
          </span>
        ) : null}

        {/* Waiting is a state worth naming. A guest who joined a queue should
            see where they are in it, not a bare "12 going" that reads as if
            they were one of them. Not shown once invited — "#1 in the queue"
            would read as still-waiting for someone who is one tap from a seat. */}
        {workshop.status === 'waitlisted' && workshop.waitlist_position ? (
          <span className="bg-butter-soft text-butter-ink rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-extrabold">
            #{workshop.waitlist_position} in the queue
          </span>
        ) : null}

        <span className="text-latte text-xs font-bold">{workshop.attendee_count} going</span>
      </div>
    </Link>
  );
}
