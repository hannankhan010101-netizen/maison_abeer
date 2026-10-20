import { describe, expect, it } from 'vitest';

import { dateLeaf, durationCopy, nextClass, whenCopy } from './format';

// Local-time constructors, not ISO strings with a zone: every helper here
// formats in the visitor's own timezone, and a fixed-offset string would make
// the expected day flip depending on where the test machine sits.
function at(year: number, month: number, day: number, hour = 12, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

describe('dateLeaf', () => {
  it('splits a date into the three pieces a calendar leaf shows', () => {
    expect(dateLeaf(at(2026, 10, 23), 'en-US')).toEqual({
      day: '23',
      weekday: 'Fri',
      month: 'Oct',
    });
  });

  it('never pads the day — a leaf says 3, not 03', () => {
    expect(dateLeaf(at(2026, 11, 3), 'en-US').day).toBe('3');
  });
});

describe('durationCopy', () => {
  it('reads whole hours in the plural', () => {
    expect(durationCopy(at(2026, 10, 23, 10), at(2026, 10, 23, 12))).toBe('2 hrs');
  });

  it('reads one hour in the singular', () => {
    expect(durationCopy(at(2026, 10, 23, 10), at(2026, 10, 23, 11))).toBe('1 hr');
  });

  it('combines hours and minutes', () => {
    expect(durationCopy(at(2026, 10, 23, 10), at(2026, 10, 23, 12, 30))).toBe('2 hrs 30 min');
  });

  it('reads under an hour as minutes alone', () => {
    expect(durationCopy(at(2026, 10, 23, 10), at(2026, 10, 23, 10, 45))).toBe('45 min');
  });

  it('is null when the payload cannot say, rather than "0 min"', () => {
    expect(durationCopy(at(2026, 10, 23, 10), at(2026, 10, 23, 10))).toBeNull();
    expect(durationCopy(at(2026, 10, 23, 12), at(2026, 10, 23, 10))).toBeNull();
    expect(durationCopy(at(2026, 10, 23, 10), 'not a date')).toBeNull();
  });
});

describe('nextClass', () => {
  it('picks the soonest start, whatever order the list came in', () => {
    const later = { id: 'b', starts_at: at(2026, 10, 30) };
    const sooner = { id: 'a', starts_at: at(2026, 10, 23) };

    expect(nextClass([later, sooner])).toBe(sooner);
  });

  it('still counts a full class — the waitlist is a real way in', () => {
    const full = { id: 'full', starts_at: at(2026, 10, 23), is_full: true };
    const open = { id: 'open', starts_at: at(2026, 10, 30), is_full: false };

    expect(nextClass([open, full])?.id).toBe('full');
  });

  it('is null with nothing on offer', () => {
    expect(nextClass([])).toBeNull();
  });
});

describe('whenCopy', () => {
  const now = new Date(2026, 9, 21, 23, 30); // late on Wednesday 21 Oct 2026

  it('says today for later the same day', () => {
    expect(whenCopy(at(2026, 10, 21, 23, 45), now, 'en-US')).toBe('today');
  });

  it('says tomorrow by calendar day, not by 24-hour window', () => {
    // 9am tomorrow is under 24h away; it is still "tomorrow", not "today".
    expect(whenCopy(at(2026, 10, 22, 9), now, 'en-US')).toBe('tomorrow');
  });

  it('names the weekday inside the coming week', () => {
    expect(whenCopy(at(2026, 10, 23), now, 'en-US')).toBe('this Friday');
    expect(whenCopy(at(2026, 10, 27), now, 'en-US')).toBe('this Tuesday');
  });

  it('falls back to the date a week or more out', () => {
    expect(whenCopy(at(2026, 10, 28), now, 'en-US')).toBe('Wed, Oct 28');
  });
});
