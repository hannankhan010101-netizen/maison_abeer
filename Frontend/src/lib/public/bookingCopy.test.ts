import { describe, expect, it } from 'vitest';

import type { PublicClass } from './api';
import { ACCENT, accentFor, formatDay, formatTime, seatCopy, seatsLine } from './bookingCopy';

function aClass(overrides: Partial<PublicClass> = {}): PublicClass {
  return {
    id: 'c1',
    name: 'Pottery',
    starts_at: new Date(2026, 9, 23, 15, 0).toISOString(),
    ends_at: new Date(2026, 9, 23, 17, 30).toISOString(),
    location: null,
    color_token: 'terra',
    photo_url: null,
    seats_left: 8,
    is_full: false,
    waitlist_is_open: false,
    ...overrides,
  };
}

/**
 * Scarcity is only ever the real seat count. These are the words a guest reads
 * on the conversion surface, so each threshold is pinned.
 */
describe('seatCopy', () => {
  it('sends a full class to the waitlist, and is not urgent about it', () => {
    expect(seatCopy(aClass({ is_full: true, seats_left: 0 }))).toEqual({
      text: 'Fully booked · join the waitlist',
      urgent: false,
    });
  });

  it('calls the last seat the last seat', () => {
    expect(seatCopy(aClass({ seats_left: 1 }))).toEqual({ text: 'Last seat!', urgent: true });
  });

  it.each([2, 3])('says "only N seats left" at %i, and is urgent', (seats) => {
    expect(seatCopy(aClass({ seats_left: seats }))).toEqual({
      text: `Only ${seats} seats left`,
      urgent: true,
    });
  });

  it('states four or more plainly, without urgency', () => {
    expect(seatCopy(aClass({ seats_left: 4 }))).toEqual({ text: '4 seats left', urgent: false });
    expect(seatCopy(aClass({ seats_left: 12 }))).toEqual({ text: '12 seats left', urgent: false });
  });
});

describe('formatDay and formatTime', () => {
  const iso = new Date(2026, 9, 23, 15, 5).toISOString();

  it('spell the day out, long-form', () => {
    expect(formatDay(iso)).toMatch(/Friday/);
    expect(formatDay(iso)).toMatch(/23/);
  });

  it('give the hour and minute', () => {
    expect(formatTime(iso)).toMatch(/3:05/);
  });
});

describe('accentFor', () => {
  it.each(['pink', 'terra', 'sage'])('knows the %s craft colour', (token) => {
    expect(accentFor(token)).toBe(ACCENT[token]);
  });

  it('falls back to pink for a colour it does not know', () => {
    expect(accentFor('mauve')).toBe(ACCENT.pink);
  });
});

describe('seatsLine', () => {
  // Tuesday 20 October 2026, noon: Friday the 23rd is "this Friday".
  const now = new Date(2026, 9, 20, 12, 0);

  it('is null when no class has a seat open', () => {
    expect(seatsLine([], now)).toBeNull();
    expect(seatsLine([aClass({ seats_left: 0, is_full: true })], now)).toBeNull();
    expect(seatsLine([aClass({ seats_left: 3, is_full: true })], now)).toBeNull();
  });

  it('names the seats and the day when one class is open', () => {
    expect(seatsLine([aClass({ seats_left: 8 })], now)).toBe('8 seats left this Friday');
  });

  it('says "last seat" for a single seat', () => {
    const tomorrow = aClass({
      seats_left: 1,
      starts_at: new Date(2026, 9, 21, 15, 0).toISOString(),
      ends_at: new Date(2026, 9, 21, 17, 0).toISOString(),
    });
    expect(seatsLine([tomorrow, aClass({ id: 'full', seats_left: 0, is_full: true })], now)).toBe(
      'last seat tomorrow',
    );
  });

  it('sums the seats across several open classes', () => {
    const classes = [
      aClass({ id: 'a', seats_left: 8 }),
      aClass({ id: 'b', seats_left: 4 }),
      aClass({ id: 'c', seats_left: 2 }),
      aClass({ id: 'd', seats_left: 0, is_full: true }),
    ];
    expect(seatsLine(classes, now)).toBe('14 seats across 3 classes');
  });
});
