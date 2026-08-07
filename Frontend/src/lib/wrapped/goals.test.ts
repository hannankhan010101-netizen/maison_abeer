import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GOAL_STORAGE_KEY,
  encouragementFor,
  loadGoals,
  progressFor,
  saveGoals,
  type Goal,
} from './goals';

const TOTALS = { guests: 48, classes: 6, sellouts: 2 };

function goal(overrides: Partial<Goal> = {}): Goal {
  return { id: 'g1', metric: 'guests', target: 100, label: '100 people', ...overrides };
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('progressFor', () => {
  it('measures against the right metric', () => {
    const progress = progressFor(goal({ metric: 'classes', target: 12 }), TOTALS);

    expect(progress.current).toBe(6);
    expect(progress.fraction).toBeCloseTo(0.5);
    expect(progress.remaining).toBe(6);
  });

  it('caps a beaten goal at complete rather than overflowing', () => {
    const progress = progressFor(goal({ target: 10 }), TOTALS);

    // A 480% progress ring looks like a bug, not an achievement.
    expect(progress.fraction).toBe(1);
    expect(progress.remaining).toBe(0);
    expect(progress.isComplete).toBe(true);
  });

  it('never divides by zero on a zero target', () => {
    expect(progressFor(goal({ target: 0 }), TOTALS).fraction).toBe(1);
  });

  it('handles a metric with nothing yet', () => {
    const progress = progressFor(goal({ metric: 'sellouts', target: 5 }), {
      ...TOTALS,
      sellouts: 0,
    });

    expect(progress.current).toBe(0);
    expect(progress.fraction).toBe(0);
    expect(progress.isComplete).toBe(false);
  });
});

describe('encouragementFor', () => {
  it('says something different at every distance', () => {
    const messages = [0, 0.1, 0.3, 0.6, 0.95, 1].map((fraction) =>
      encouragementFor(fraction, 10, 'guests'),
    );

    // A single "keep going" for every state reads like it never looked.
    expect(new Set(messages).size).toBe(messages.length);
  });

  it('celebrates a finished goal', () => {
    expect(encouragementFor(1, 0, 'guests')).toContain('Done');
  });

  it('is kind about having not started', () => {
    const message = encouragementFor(0, 100, 'guests');

    // No shame copy, ever (PRD §2.5).
    expect(message).toContain('fine place to start');
  });

  it('names what is left when the number is useful', () => {
    expect(encouragementFor(0.95, 5, 'guests')).toContain('5');
  });
});

describe('storage', () => {
  it('round-trips goals', () => {
    saveGoals([goal()]);
    expect(loadGoals()).toEqual([goal()]);
  });

  it('is empty when nothing is stored', () => {
    expect(loadGoals()).toEqual([]);
  });

  it('survives corrupted storage', () => {
    localStorage.setItem(GOAL_STORAGE_KEY, '{not json');
    expect(loadGoals()).toEqual([]);
  });

  it('discards entries that are not goals', () => {
    // Local storage is hand-editable and survives version changes, so its
    // contents are untrusted input.
    localStorage.setItem(
      GOAL_STORAGE_KEY,
      JSON.stringify([goal(), { id: 'x' }, null, 'nope', { ...goal(), metric: 'vibes' }]),
    );

    expect(loadGoals()).toEqual([goal()]);
  });

  it('ignores a non-array payload', () => {
    localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify({ id: 'g1' }));
    expect(loadGoals()).toEqual([]);
  });

  it('does not throw when storage refuses to write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    // Private browsing refuses storage; losing a goal beats crashing a render.
    expect(() => saveGoals([goal()])).not.toThrow();
  });
});
