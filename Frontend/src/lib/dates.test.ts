import { describe, expect, it } from 'vitest';

import {
  formatDayLabel,
  addDays,
  addWeeks,
  dayKey,
  endOfWeek,
  groupByDay,
  humanCountdown,
  isSameDay,
  isoWeekday,
  startOfWeek,
  timeOfDay,
  weekDays,
  weekWindow,
} from './dates';

/** Local-time constructor, so tests do not depend on the runner's zone. */
function at(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

describe('week boundaries', () => {
  it('starts the week on Monday', () => {
    // 2026-08-04 is a Tuesday.
    expect(startOfWeek(at(2026, 8, 4))).toEqual(at(2026, 8, 3));
  });

  it('treats Sunday as the end of the week, not the start', () => {
    // The classic off-by-one: getDay() is Sunday-first.
    expect(startOfWeek(at(2026, 8, 9))).toEqual(at(2026, 8, 3));
  });

  it('leaves a Monday where it is', () => {
    expect(startOfWeek(at(2026, 8, 3))).toEqual(at(2026, 8, 3));
  });

  it('ends the week on Sunday night', () => {
    const end = endOfWeek(at(2026, 8, 4));

    expect(end.getDate()).toBe(9);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it('returns seven days, Monday first', () => {
    const days = weekDays(at(2026, 8, 4));

    expect(days).toHaveLength(7);
    expect(days[0]).toEqual(at(2026, 8, 3));
    expect(days[6]).toEqual(at(2026, 8, 9));
  });

  it('crosses a month boundary', () => {
    // 2026-09-01 is a Tuesday; its week starts in August.
    expect(startOfWeek(at(2026, 9, 1)).getMonth()).toBe(7);
  });

  it('crosses a year boundary', () => {
    // 2027-01-01 is a Friday.
    expect(startOfWeek(at(2027, 1, 1))).toEqual(at(2026, 12, 28));
  });

  it('builds a query window covering the whole week', () => {
    const { start, end } = weekWindow(at(2026, 8, 4));

    expect(new Date(start).getDate()).toBe(3);
    expect(new Date(end).getDate()).toBe(9);
    expect(new Date(start).getTime()).toBeLessThan(new Date(end).getTime());
  });
});

describe('formatDayLabel', () => {
  it('puts the weekday before the day number', () => {
    // Intl's own {weekday, day} format renders "4 Tue" in en-US, which reads
    // wrong as a column header — hence composing the order ourselves.
    expect(formatDayLabel(at(2026, 8, 4), 'en-US')).toBe('tue 4');
  });

  it('still localises the weekday name', () => {
    expect(formatDayLabel(at(2026, 8, 4), 'fr-FR')).toMatch(/^mar\.? 4$/);
  });
});

describe('arithmetic', () => {
  it('adds days across a month boundary', () => {
    expect(addDays(at(2026, 8, 30), 3)).toEqual(at(2026, 9, 2));
  });

  it('adds weeks', () => {
    expect(addWeeks(at(2026, 8, 4), 2)).toEqual(at(2026, 8, 18));
  });

  it('subtracts', () => {
    expect(addWeeks(at(2026, 8, 4), -1)).toEqual(at(2026, 7, 28));
  });
});

describe('comparisons', () => {
  it('matches the same calendar day at different times', () => {
    expect(isSameDay(at(2026, 8, 4, 1), at(2026, 8, 4, 23))).toBe(true);
  });

  it('does not match adjacent days', () => {
    expect(isSameDay(at(2026, 8, 4, 23, 59), at(2026, 8, 5, 0, 1))).toBe(false);
  });

  it('reports ISO weekdays with Monday as 1 and Sunday as 7', () => {
    // Matches the backend's rest_days encoding.
    expect(isoWeekday(at(2026, 8, 3))).toBe(1);
    expect(isoWeekday(at(2026, 8, 9))).toBe(7);
  });
});

describe('humanCountdown', () => {
  const now = at(2026, 8, 4, 10);

  it('counts hours within the day', () => {
    expect(humanCountdown(at(2026, 8, 4, 14).toISOString(), now)).toBe('in 4 hours');
  });

  it('uses the singular for one hour', () => {
    expect(humanCountdown(at(2026, 8, 4, 11).toISOString(), now)).toBe('in 1 hour');
  });

  it('says "starting soon" under an hour', () => {
    expect(humanCountdown(at(2026, 8, 4, 10, 30).toISOString(), now)).toBe('starting soon');
  });

  it('says "tomorrow" rather than "in 24 hours"', () => {
    expect(humanCountdown(at(2026, 8, 5, 10).toISOString(), now)).toBe('tomorrow');
  });

  it('counts days beyond that', () => {
    expect(humanCountdown(at(2026, 8, 7, 10).toISOString(), now)).toBe('in 3 days');
  });

  it('reports a class already underway', () => {
    expect(humanCountdown(at(2026, 8, 4, 9).toISOString(), now)).toBe('in progress');
  });
});

describe('timeOfDay', () => {
  it.each([
    [6, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [23, 'evening'],
  ])('at %i:00 it is %s', (hour, expected) => {
    expect(timeOfDay(at(2026, 8, 4, hour))).toBe(expected);
  });
});

describe('grouping', () => {
  it('groups sessions by local day', () => {
    const sessions = [
      { starts_at: at(2026, 8, 4, 18).toISOString() },
      { starts_at: at(2026, 8, 4, 10).toISOString() },
      { starts_at: at(2026, 8, 5, 10).toISOString() },
    ];

    const grouped = groupByDay(sessions);

    expect(grouped.size).toBe(2);
    expect(grouped.get('2026-08-04')).toHaveLength(2);
  });

  it('orders a day earliest first', () => {
    const sessions = [
      { starts_at: at(2026, 8, 4, 18).toISOString() },
      { starts_at: at(2026, 8, 4, 10).toISOString() },
    ];

    const day = groupByDay(sessions).get('2026-08-04')!;

    expect(new Date(day[0]!.starts_at).getHours()).toBe(10);
  });

  it('keys by local date, not UTC', () => {
    // A late-evening class must not be filed under tomorrow because
    // toISOString() shifted it past midnight UTC.
    const late = at(2026, 8, 4, 23, 30);

    expect(dayKey(late)).toBe('2026-08-04');
  });

  it('handles an empty list', () => {
    expect(groupByDay([]).size).toBe(0);
  });
});
