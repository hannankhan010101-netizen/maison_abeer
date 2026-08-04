import { describe, expect, it } from 'vitest';

import {
  LAYOUTS,
  NAME_SIZES,
  THEMES,
  buildTags,
  layoutById,
  nameFontSize,
  pageCount,
  subtextFor,
  themeById,
  themeForColorToken,
  unassignedNames,
  type TagOptions,
} from './themes';

const ALL_ON: TagOptions = { showTableNumber: true, showSubtext: true, showQrCode: true };

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    status: 'confirmed',
    table_number: 2 as number | null,
    booking_answers: null as Record<string, string> | null,
    guest: { full_name: 'Sana R.' },
    ...overrides,
  };
}

describe('themes', () => {
  it('ships the three signature themes plus a seasonal drop', () => {
    expect(THEMES).toHaveLength(4);
    expect(THEMES.filter((theme) => theme.seasonal)).toHaveLength(1);
  });

  it('preselects the theme matching the class colour', () => {
    expect(themeForColorToken('terra').id).toBe('clay');
    expect(themeForColorToken('sage').id).toBe('pastel');
    expect(themeForColorToken('pink').id).toBe('coquette');
  });

  it('never preselects a seasonal drop', () => {
    // A limited pack should be chosen deliberately, not defaulted into.
    expect(themeForColorToken('butter').seasonal).toBeFalsy();
  });

  it('falls back rather than returning undefined', () => {
    expect(themeById('nope' as never)).toBe(THEMES[0]);
    expect(layoutById('nope' as never)).toBe(LAYOUTS[0]);
  });
});

describe('pageCount', () => {
  it('fills whole pages', () => {
    expect(pageCount(16, 'a4-8')).toBe(2);
  });

  it('rounds a partial page up', () => {
    // 9 tags still needs a second sheet.
    expect(pageCount(9, 'a4-8')).toBe(2);
  });

  it('is zero for an empty roster', () => {
    expect(pageCount(0, 'a4-8')).toBe(0);
  });

  it('gives one page per tag on thermal', () => {
    expect(pageCount(8, 'thermal')).toBe(8);
  });
});

describe('nameFontSize', () => {
  it('keeps short names at full size', () => {
    expect(nameFontSize('Sana')).toBe(NAME_SIZES.base);
    expect(nameFontSize('Meerab')).toBe(NAME_SIZES.base);
  });

  it('steps down as a name grows', () => {
    const sizes = ['Sana', 'Fatima Noor', 'Ayesha Khan Malik', 'Muhammad Abdul Rahman Khan'].map(
      nameFontSize,
    );

    // Monotonically non-increasing — never bigger for a longer name.
    for (let index = 1; index < sizes.length; index++) {
      expect(sizes[index]!).toBeLessThan(sizes[index - 1]!);
    }
  });

  it('shrinks rather than wrapping a very long name', () => {
    // A wrapped name cannot be fixed after the sheet is cut.
    expect(nameFontSize('Muhammad Abdul Rahman Khan')).toBe(NAME_SIZES.tiny);
  });

  it('ignores surrounding whitespace', () => {
    expect(nameFontSize('   Sana   ')).toBe(NAME_SIZES.base);
  });
});

describe('subtextFor', () => {
  it('uses the first answer given', () => {
    expect(subtextFor({ flavour: 'team gulab jamun 🍮' })).toBe('team gulab jamun 🍮');
  });

  it('skips blank answers', () => {
    expect(subtextFor({ a: '   ', b: 'first pottery class!' })).toBe('first pottery class!');
  });

  it('returns null when there is nothing to show', () => {
    expect(subtextFor(null)).toBeNull();
    expect(subtextFor({})).toBeNull();
    expect(subtextFor({ a: '  ' })).toBeNull();
  });

  it('truncates an answer too long for a tag', () => {
    const long = 'this is a very long answer that will never fit on a small printed name tag';
    const result = subtextFor(long ? { a: long } : null)!;

    expect(result.length).toBeLessThanOrEqual(32);
    expect(result.endsWith('…')).toBe(true);
  });

  it('does not truncate one that fits', () => {
    expect(subtextFor({ a: 'birthday girl 🎂' })).toBe('birthday girl 🎂');
  });
});

describe('buildTags', () => {
  it('excludes cancelled bookings', () => {
    const tags = buildTags(
      [booking(), booking({ id: 'b2', status: 'cancelled', guest: { full_name: 'Gone' } })],
      ALL_ON,
    );

    // Printing a tag for someone who is not coming is the exact class of
    // small error this product exists to prevent.
    expect(tags).toHaveLength(1);
    expect(tags[0]!.name).toBe('Sana R.');
  });

  it('keeps attended and no-show bookings', () => {
    const tags = buildTags(
      [booking({ status: 'attended' }), booking({ id: 'b2', status: 'no_show' })],
      ALL_ON,
    );

    expect(tags).toHaveLength(2);
  });

  it('omits the table number when the toggle is off', () => {
    const tags = buildTags([booking()], { ...ALL_ON, showTableNumber: false });
    expect(tags[0]!.tableNumber).toBeNull();
  });

  it('omits subtext when the toggle is off', () => {
    const tags = buildTags([booking({ booking_answers: { flavour: 'matcha' } })], {
      ...ALL_ON,
      showSubtext: false,
    });

    expect(tags[0]!.subtext).toBeNull();
  });

  it('handles an empty roster', () => {
    expect(buildTags([], ALL_ON)).toEqual([]);
  });
});

describe('unassignedNames', () => {
  it('names guests still without a table', () => {
    const tags = buildTags(
      [booking(), booking({ id: 'b2', table_number: null, guest: { full_name: 'Hira' } })],
      ALL_ON,
    );

    expect(unassignedNames(tags, true)).toEqual(['Hira']);
  });

  it('is empty when table numbers are hidden', () => {
    // Nothing to fix if the number is not being printed.
    const tags = buildTags([booking({ table_number: null })], {
      ...ALL_ON,
      showTableNumber: false,
    });

    expect(unassignedNames(tags, false)).toEqual([]);
  });
});
