import { describe, expect, it } from 'vitest';

import {
  keysInvalidatedByBooking,
  keysInvalidatedByReschedule,
  keysInvalidatedBySeatChange,
  queryKeys,
} from './keys';

const SESSION = 'session-1';
const GUEST = 'guest-1';

/** Does `key` fall under `prefix`, the way TanStack Query matches? */
function matchesPrefix(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => key[index] === part);
}

describe('query keys', () => {
  it('scopes every session key under a shared prefix', () => {
    const keys = [
      queryKeys.sessions.window('2026-08-01', '2026-08-31'),
      queryKeys.sessions.detail(SESSION),
      queryKeys.sessions.roster(SESSION),
      queryKeys.sessions.waitlist(SESSION),
    ];

    // Invalidating ['sessions'] must reach all of them.
    for (const key of keys) {
      expect(matchesPrefix(key, queryKeys.sessions.all)).toBe(true);
    }
  });

  it('scopes every guest key under a shared prefix', () => {
    const keys = [
      queryKeys.guests.list({ search: 'sana' }),
      queryKeys.guests.detail(GUEST),
      queryKeys.guests.birthdays,
    ];

    for (const key of keys) {
      expect(matchesPrefix(key, queryKeys.guests.all)).toBe(true);
    }
  });

  it('separates windows so two calendar months do not share a cache entry', () => {
    const august = queryKeys.sessions.window('2026-08-01', '2026-08-31');
    const september = queryKeys.sessions.window('2026-09-01', '2026-09-30');

    expect(august).not.toEqual(september);
  });

  it('separates guest list filters', () => {
    expect(queryKeys.guests.list({ search: 'sana' })).not.toEqual(
      queryKeys.guests.list({ search: 'ayesha' }),
    );
    expect(queryKeys.guests.list({ regularsOnly: true })).not.toEqual(
      queryKeys.guests.list({ regularsOnly: false }),
    );
  });

  it('treats an absent search the same as an empty one', () => {
    // Otherwise clearing the box refetches instead of reusing the cache.
    expect(queryKeys.guests.list({})).toEqual(queryKeys.guests.list({ search: '' }));
  });
});

describe('invalidation sets', () => {
  it('a seat change invalidates everything capacity feeds', () => {
    const keys = keysInvalidatedBySeatChange(SESSION);

    // Capacity drives the ring, the roster's availability and the checklist
    // quantities — missing one leaves a stale number on screen.
    expect(keys).toContainEqual(queryKeys.sessions.detail(SESSION));
    expect(keys).toContainEqual(queryKeys.sessions.roster(SESSION));
    expect(keys).toContainEqual(queryKeys.sessions.waitlist(SESSION));
    expect(keys).toContainEqual(queryKeys.sessions.all);
  });

  it('a reschedule invalidates the calendar windows', () => {
    const keys = keysInvalidatedByReschedule(SESSION);

    // The class moved, so any window query may now be wrong.
    expect(keys).toContainEqual(queryKeys.sessions.all);
    expect(keys).toContainEqual(queryKeys.sessions.detail(SESSION));
  });

  it('a booking invalidates the guest as well as the session', () => {
    const keys = keysInvalidatedByBooking(SESSION, GUEST);

    // visit_count drives the "3rd visit" badge wherever that guest appears.
    expect(keys).toContainEqual(queryKeys.guests.detail(GUEST));
    expect(keys).toContainEqual(queryKeys.guests.all);
    expect(keys).toContainEqual(queryKeys.sessions.roster(SESSION));
  });

  it('every invalidation set is non-empty', () => {
    expect(keysInvalidatedBySeatChange(SESSION).length).toBeGreaterThan(0);
    expect(keysInvalidatedByReschedule(SESSION).length).toBeGreaterThan(0);
    expect(keysInvalidatedByBooking(SESSION, GUEST).length).toBeGreaterThan(0);
  });
});
