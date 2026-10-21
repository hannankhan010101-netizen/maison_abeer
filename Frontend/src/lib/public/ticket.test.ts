import { describe, expect, it } from 'vitest';

import { type BookingResult } from '@/lib/public/api';
import { formatDay, formatTime } from '@/lib/public/bookingCopy';

import { ticketFilename, ticketModel, wrapLines } from './ticket';

const STARTS = '2026-11-06T14:00:00.000Z';
const TOKEN = 'secret-portal-token-123';

function result(overrides: Partial<BookingResult> = {}): BookingResult {
  return {
    outcome: 'booked',
    class_name: 'Bento cake decorating',
    starts_at: STARTS,
    location: 'Studio A',
    waitlist_position: null,
    portal_token: TOKEN,
    portal_token_type: 'magiclink',
    ...overrides,
  };
}

const tenEach = (text: string) => Array.from(text).length * 10;

describe('ticketModel', () => {
  it('reads the day and time with the booking copy and keeps the location', () => {
    const model = ticketModel({ result: result(), studioName: 'Maison Abeer' });
    expect(model).toEqual({
      studio: 'Maison Abeer',
      className: 'Bento cake decorating',
      day: formatDay(STARTS),
      time: formatTime(STARTS),
      location: 'Studio A',
    });
  });

  it('keeps a missing location as null', () => {
    const model = ticketModel({ result: result({ location: null }), studioName: 'S' });
    expect(model.location).toBeNull();
  });

  it('never carries the portal token', () => {
    const model = ticketModel({ result: result(), studioName: 'Maison Abeer' });
    expect(Object.keys(model)).not.toContain('portal_token');
    expect(JSON.stringify(model)).not.toContain(TOKEN);
    expect(JSON.stringify(model)).not.toContain('magiclink');
  });
});

describe('ticketFilename', () => {
  it('slugs the class name', () => {
    expect(ticketFilename('Bento cake decorating')).toBe('bento-cake-decorating-ticket.png');
  });

  it('falls back to ticket.png when nothing is left', () => {
    expect(ticketFilename('')).toBe('ticket.png');
    expect(ticketFilename('🎂🎂')).toBe('ticket.png');
  });

  it('cuts a long name to 60 characters of slug', () => {
    expect(ticketFilename('a'.repeat(120))).toBe(`${'a'.repeat(60)}-ticket.png`);
  });

  it('does not end the slug on a dash after cutting', () => {
    expect(ticketFilename(`${'a'.repeat(59)} bcd`)).toBe(`${'a'.repeat(59)}-ticket.png`);
  });
});

describe('wrapLines', () => {
  it('keeps a short text on one line', () => {
    expect(wrapLines(tenEach, 'Bento cake', 200, 2)).toEqual(['Bento cake']);
  });

  it('wraps at spaces', () => {
    expect(wrapLines(tenEach, 'Bento cake decorating', 120, 3)).toEqual([
      'Bento cake',
      'decorating',
    ]);
  });

  it('hard-cuts a single word that is too long', () => {
    expect(wrapLines(tenEach, 'x'.repeat(40), 100, 5)).toEqual([
      'x'.repeat(10),
      'x'.repeat(10),
      'x'.repeat(10),
      'x'.repeat(10),
    ]);
  });

  it('ends the last line in an ellipsis on overflow, within the width', () => {
    const text = 'one two three four five six seven eight nine ten';
    const lines = wrapLines(tenEach, text, 100, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
    for (const line of lines) expect(tenEach(line)).toBeLessThanOrEqual(100);
  });

  it('does not split an emoji', () => {
    const lines = wrapLines(tenEach, '🎂'.repeat(15), 100, 1);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.endsWith('…')).toBe(true);
    expect(
      Array.from(lines[0]!)
        .slice(0, -1)
        .every((ch) => ch === '🎂'),
    ).toBe(true);
    expect(tenEach(lines[0]!)).toBeLessThanOrEqual(100);
  });
});
