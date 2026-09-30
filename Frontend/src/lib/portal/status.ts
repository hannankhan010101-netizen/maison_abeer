import type { WorkshopStatus } from '@/lib/api/types';

/**
 * How each workshop state is labelled to a guest.
 *
 * Shared by the list card and the detail page rather than owned by one of
 * them: the detail page used to label only `cancelled`, so a guest third in a
 * queue landed on a page visually indistinguishable from a confirmed booking
 * and could reasonably conclude they had a seat.
 */
export const WORKSHOP_STATUS: Record<
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

/** Whether this state means the guest actually has a seat. */
export function holdsASeat(status: WorkshopStatus): boolean {
  return status !== 'waitlisted' && status !== 'invited' && status !== 'cancelled';
}
