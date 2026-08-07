import { describe, expect, it } from 'vitest';

import {
  buildSlides,
  deriveWrapped,
  longestWeeklyStreak,
  personalityFor,
  tallyWords,
} from './stats';
import type { Session } from '@/lib/api/types';

const NOW = new Date(2026, 7, 20, 12, 0);

function session(overrides: Partial<Session> & { id: string }): Session {
  return {
    class_type_id: 'ct-1',
    class_type_name: 'Bento cake',
    color_token: 'pink',
    title: null,
    location: null,
    notes: null,
    starts_at: new Date(2026, 7, 1, 14, 0).toISOString(),
    ends_at: new Date(2026, 7, 1, 16, 0).toISOString(),
    status: 'completed',
    capacity: {
      seats: 10,
      booked: 8,
      available: 2,
      state: 'nearly_full',
      waitlist_is_open: false,
      accepts_bookings: false,
    },
    unassigned_guest_count: 0,
    roster_changed_since_export: false,
    ...overrides,
  };
}

/** A class on a given date, two hours long. */
function on(id: string, date: Date, overrides: Partial<Session> = {}): Session {
  const end = new Date(date);
  end.setHours(end.getHours() + 2);

  return session({ id, starts_at: date.toISOString(), ends_at: end.toISOString(), ...overrides });
}

describe('tallyWords', () => {
  it('counts the words people actually used', () => {
    const words = tallyWords(['calm', 'messy', 'calm', 'joyful', 'calm', 'messy']);

    expect(words[0]).toEqual({ word: 'calm', count: 3 });
    expect(words[1]).toEqual({ word: 'messy', count: 2 });
  });

  it('is case and whitespace insensitive', () => {
    expect(tallyWords(['Calm', ' calm ', 'CALM'])[0]).toEqual({ word: 'calm', count: 3 });
  });

  it('drops filler that says nothing about the class', () => {
    expect(tallyWords(['good', 'very', 'the', 'therapeutic'])).toEqual([
      { word: 'therapeutic', count: 1 },
    ]);
  });

  it('breaks ties alphabetically so the order is stable', () => {
    // Otherwise the cloud reshuffles on every render for no reason.
    expect(tallyWords(['zen', 'arty']).map((w) => w.word)).toEqual(['arty', 'zen']);
  });

  it('handles nobody having answered yet', () => {
    expect(tallyWords([])).toEqual([]);
  });
});

describe('longestWeeklyStreak', () => {
  it('counts consecutive weeks', () => {
    const streak = longestWeeklyStreak([
      on('a', new Date(2026, 7, 3, 14)),
      on('b', new Date(2026, 7, 10, 14)),
      on('c', new Date(2026, 7, 17, 14)),
    ]);

    expect(streak).toBe(3);
  });

  it('breaks on a skipped week', () => {
    const streak = longestWeeklyStreak([
      on('a', new Date(2026, 7, 3, 14)),
      on('b', new Date(2026, 7, 17, 14)),
    ]);

    expect(streak).toBe(1);
  });

  it('counts two classes in one week as one week', () => {
    const streak = longestWeeklyStreak([
      on('a', new Date(2026, 7, 3, 14)),
      on('b', new Date(2026, 7, 5, 14)),
    ]);

    expect(streak).toBe(1);
  });

  it('survives a year boundary', () => {
    // 2026-12-28 and 2027-01-04 are consecutive ISO weeks.
    const streak = longestWeeklyStreak([
      on('a', new Date(2026, 11, 28, 14)),
      on('b', new Date(2027, 0, 4, 14)),
    ]);

    expect(streak).toBe(2);
  });

  it('is zero with no classes', () => {
    expect(longestWeeklyStreak([])).toBe(0);
  });
});

describe('personalityFor', () => {
  it('calls a mostly-sold-out studio its era', () => {
    const soldOut = { ...session({ id: 'x' }).capacity, state: 'sold_out' as const };
    const sessions = ['a', 'b', 'c', 'd'].map((id) => session({ id, capacity: soldOut }));

    expect(personalityFor(sessions).id).toBe('soldOut');
  });

  it('spots a weekend studio', () => {
    // 2026-08-01 is a Saturday, 08-02 a Sunday.
    const sessions = [
      on('a', new Date(2026, 7, 1, 14)),
      on('b', new Date(2026, 7, 2, 14)),
      on('c', new Date(2026, 7, 8, 14)),
    ];

    expect(personalityFor(sessions).id).toBe('weekender');
  });

  it('spots a morning studio', () => {
    const sessions = [
      on('a', new Date(2026, 7, 4, 9)),
      on('b', new Date(2026, 7, 6, 10)),
      on('c', new Date(2026, 7, 8, 8)),
    ];

    expect(personalityFor(sessions).id).toBe('sunrise');
  });

  it('spots an evening studio', () => {
    const sessions = [
      on('a', new Date(2026, 7, 4, 18)),
      on('b', new Date(2026, 7, 6, 19)),
      on('c', new Date(2026, 7, 8, 18)),
    ];

    expect(personalityFor(sessions).id).toBe('moonlit');
  });

  it('welcomes a studio with no history yet', () => {
    expect(personalityFor([]).id).toBe('newStudio');
  });

  it('always returns real copy, never an empty shell', () => {
    for (const sessions of [[], [on('a', new Date(2026, 7, 4, 9))]]) {
      const personality = personalityFor(sessions);

      expect(personality.title.length).toBeGreaterThan(2);
      expect(personality.blurb.length).toBeGreaterThan(10);
      expect(personality.emoji).toBeTruthy();
    }
  });
});

describe('deriveWrapped', () => {
  const sessions = [
    on('a', new Date(2026, 7, 1, 14)),
    on('b', new Date(2026, 7, 8, 14), { class_type_name: 'Pottery' }),
    on('c', new Date(2026, 7, 15, 14)),
    on('future', new Date(2026, 8, 1, 14)),
  ];

  it('counts only classes that have finished', () => {
    // Claiming a class you have not taught is a lie a host could be caught in.
    expect(deriveWrapped({ sessions, words: [], now: NOW }).classesTaught).toBe(3);
  });

  it('adds up guests and hours', () => {
    const stats = deriveWrapped({ sessions, words: [], now: NOW });

    expect(stats.guestsTaught).toBe(24);
    expect(stats.hoursTaught).toBe(6);
  });

  it('finds the signature craft and its share', () => {
    const stats = deriveWrapped({ sessions, words: [], now: NOW });

    expect(stats.signatureCraft).toBe('Bento cake');
    expect(stats.signatureCraftShare).toBeCloseTo(2 / 3);
  });

  it('finds the busiest day by name', () => {
    expect(deriveWrapped({ sessions, words: [], now: NOW }).busiestDay).toBe('Saturday');
  });

  it('is empty but valid for a brand new studio', () => {
    const stats = deriveWrapped({ sessions: [], words: [], now: NOW });

    expect(stats.classesTaught).toBe(0);
    expect(stats.signatureCraft).toBeNull();
    expect(stats.personality.id).toBe('newStudio');
  });
});

describe('buildSlides', () => {
  const stats = deriveWrapped({
    sessions: [on('a', new Date(2026, 7, 1, 14)), on('b', new Date(2026, 7, 8, 14))],
    words: ['calm', 'calm', 'messy'],
    now: NOW,
  });

  it('opens and closes the story', () => {
    const slides = buildSlides(stats, 'this season');

    expect(slides[0]!.id).toBe('intro');
    expect(slides.at(-1)!.id).toBe('personality');
  });

  it('leads with the word people actually said', () => {
    const word = buildSlides(stats, 'this season').find((slide) => slide.id === 'word')!;

    expect(word.headline).toBe('calm');
    expect(word.detail).toContain('their word, not yours');
  });

  it('omits a slide rather than showing a zero', () => {
    const empty = deriveWrapped({ sessions: [], words: [], now: NOW });
    const ids = buildSlides(empty, 'this season').map((slide) => slide.id);

    // "0 sellouts" is worse than one fewer slide.
    expect(ids).not.toContain('soldout');
    expect(ids).not.toContain('classes');
  });

  it('still tells a story for a studio with no history', () => {
    const empty = deriveWrapped({ sessions: [], words: [], now: NOW });

    expect(buildSlides(empty, 'this season').length).toBeGreaterThanOrEqual(2);
  });

  it('gives every slide its own gradient and copy', () => {
    for (const slide of buildSlides(stats, 'this season')) {
      expect(slide.gradient).toMatch(/^from-/);
      expect(slide.headline.length).toBeGreaterThan(0);
      expect(slide.emoji).toBeTruthy();
    }
  });
});
