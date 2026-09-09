import { describe, expect, it } from 'vitest';

import { groupMessages } from './ChatThread';
import type { ChatMessage } from '@/lib/api/types';

/**
 * Runs and day breaks.
 *
 * This is the piece of the thread with real branching, and every one of its
 * decisions is visible: a wrong `startsRun` drops somebody's name, a wrong
 * `endsRun` puts the tail on the wrong bubble, and a missed day break makes
 * last week's messages look like this morning's.
 */

let clock = Date.parse('2026-08-13T10:00:00Z');

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  clock += 1000;

  return {
    id: `m${clock}`,
    body: 'hi',
    created_at: new Date(clock).toISOString(),
    author_id: 'sana',
    author_name: 'Sana',
    is_you: false,
    is_host: false,
    is_broadcast: false,
    reactions: [],
    ...overrides,
  };
}

function at(iso: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return message({
    created_at: iso,
    id: `m-${iso}-${overrides.author_id ?? 'sana'}`,
    ...overrides,
  });
}

/**
 * A local wall-clock time, as an ISO string.
 *
 * Day breaks are deliberately computed in local time — a guest in Dubai sees
 * "Today" by their own midnight, not UTC's. So a fixture written as a `Z`
 * timestamp tests a different boundary on every machine. These build the
 * instant from local parts, so the assertions hold in any timezone.
 */
function local(year: number, month: number, day: number, hour: number, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

describe('groupMessages', () => {
  it('collapses consecutive messages from one person into a run', () => {
    const grouped = groupMessages([message(), message(), message()]);

    expect(grouped.map((g) => g.startsRun)).toEqual([true, false, false]);
    // Only the last bubble of the run gets a tail and a timestamp.
    expect(grouped.map((g) => g.endsRun)).toEqual([false, false, true]);
  });

  it('starts a new run when the author changes', () => {
    const grouped = groupMessages([
      at('2026-08-13T10:00:00Z', { author_id: 'sana' }),
      at('2026-08-13T10:00:30Z', { author_id: 'noor', author_name: 'Noor' }),
    ]);

    expect(grouped.map((g) => g.startsRun)).toEqual([true, true]);
    expect(grouped.map((g) => g.endsRun)).toEqual([true, true]);
  });

  it('breaks a run when the same person returns much later', () => {
    const grouped = groupMessages([
      at('2026-08-13T10:00:00Z'),
      at('2026-08-13T10:30:00Z'), // half an hour is a new thought, not a run
    ]);

    expect(grouped.map((g) => g.startsRun)).toEqual([true, true]);
  });

  it('never folds a broadcast into a run', () => {
    // An announcement styled as the tail of someone's chatter would be lost,
    // which is the one thing a broadcast must not be.
    const grouped = groupMessages([
      at('2026-08-13T10:00:00Z', { author_id: 'host', is_host: true }),
      at('2026-08-13T10:00:10Z', { author_id: 'host', is_host: true, is_broadcast: true }),
      at('2026-08-13T10:00:20Z', { author_id: 'host', is_host: true }),
    ]);

    expect(grouped.map((g) => g.startsRun)).toEqual([true, true, true]);
    expect(grouped.map((g) => g.endsRun)).toEqual([true, true, true]);
  });

  it('marks a day break on the first message of each day', () => {
    const grouped = groupMessages([
      at(local(2026, 8, 12, 22)),
      at(local(2026, 8, 13, 9)),
      at(local(2026, 8, 13, 9, 1)),
    ]);

    expect(grouped.map((g) => g.dayBreak !== null)).toEqual([true, true, false]);
  });

  it('breaks a run across a day boundary even when the gap is small', () => {
    // Two minutes apart, but either side of local midnight: the divider goes
    // between them, so they cannot be one run.
    const grouped = groupMessages([at(local(2026, 8, 12, 23, 59)), at(local(2026, 8, 13, 0, 1))]);

    expect(grouped.map((g) => g.startsRun)).toEqual([true, true]);
    expect(grouped[1]!.dayBreak).not.toBeNull();
  });

  it('handles a single message', () => {
    const grouped = groupMessages([message()]);

    expect(grouped[0]!.startsRun).toBe(true);
    expect(grouped[0]!.endsRun).toBe(true);
    expect(grouped[0]!.dayBreak).not.toBeNull();
  });

  it('handles an empty thread', () => {
    expect(groupMessages([])).toEqual([]);
  });
});
