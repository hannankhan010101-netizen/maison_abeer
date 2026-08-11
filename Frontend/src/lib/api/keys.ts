/**
 * Query keys.
 *
 * Centralised so invalidation is precise. The PRD's cross-module contracts
 * mean a single mutation frequently invalidates several views — changing seats
 * touches the session, its roster and the dashboard — and getting that wrong
 * shows the host stale numbers on a screen they are about to act on.
 */

export const queryKeys = {
  sessions: {
    all: ['sessions'] as const,
    /** The calendar's window query. */
    window: (start: string, end: string) => ['sessions', 'window', start, end] as const,
    detail: (id: string) => ['sessions', 'detail', id] as const,
    roster: (id: string) => ['sessions', 'roster', id] as const,
    waitlist: (id: string) => ['sessions', 'waitlist', id] as const,
    checklist: (id: string) => ['sessions', 'checklist', id] as const,
    messages: (id: string) => ['sessions', 'messages', id] as const,
    tags: (id: string) => ['sessions', 'tags', id] as const,
    exports: (id: string) => ['sessions', 'exports', id] as const,
  },
  messages: {
    all: ['messages'] as const,
    failed: ['messages', 'failed'] as const,
    forGuest: (id: string) => ['messages', 'guest', id] as const,
  },
  settings: {
    all: ['settings'] as const,
    brandKit: ['settings', 'brand-kit'] as const,
  },
  guests: {
    all: ['guests'] as const,
    list: (params: { search?: string; regularsOnly?: boolean }) =>
      ['guests', 'list', params.search ?? '', params.regularsOnly ?? false] as const,
    detail: (id: string) => ['guests', 'detail', id] as const,
    birthdays: ['guests', 'birthdays'] as const,
    history: (id: string) => ['guests', 'history', id] as const,
  },
  portal: {
    all: ['portal'] as const,
    me: ['portal', 'me'] as const,
    workshops: ['portal', 'workshops'] as const,
    workshop: (id: string) => ['portal', 'workshops', id] as const,
    rooms: ['portal', 'rooms'] as const,
    room: (id: string) => ['portal', 'rooms', id] as const,
  },
} as const;

/**
 * Everything a seat change makes stale.
 *
 * Capacity feeds the ring, the roster's availability and the checklist
 * quantities, so a narrower invalidation leaves at least one of them wrong.
 */
export function keysInvalidatedBySeatChange(sessionId: string) {
  return [
    queryKeys.sessions.detail(sessionId),
    queryKeys.sessions.roster(sessionId),
    queryKeys.sessions.waitlist(sessionId),
    // Quantity-linked prep rescales with capacity (PRD §2.5).
    queryKeys.sessions.checklist(sessionId),
    queryKeys.sessions.all,
  ];
}

/** A reschedule moves the class, so any window query may now be wrong. */
export function keysInvalidatedByReschedule(sessionId: string) {
  return [queryKeys.sessions.detail(sessionId), queryKeys.sessions.all];
}

/**
 * A booking changes the roster, the session's capacity, and the guest's own
 * visit count — which drives their "3rd visit" badge everywhere it appears.
 */
export function keysInvalidatedByBooking(sessionId: string, guestId: string) {
  return [
    queryKeys.sessions.detail(sessionId),
    queryKeys.sessions.roster(sessionId),
    queryKeys.sessions.all,
    queryKeys.guests.detail(guestId),
    queryKeys.guests.all,
  ];
}
