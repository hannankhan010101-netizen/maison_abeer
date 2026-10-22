import { describe, expect, it } from 'vitest';

import { BentoCake } from './BentoCake';
import { CAST, CAST_NAMES, MOODS, castLabel } from './cast';
import { Dot } from './Dot';
import { Pip } from './Pip';

describe('the cast', () => {
  it('has one character for each craft the studio can teach', () => {
    expect(Object.keys(CAST).sort()).toEqual(['cake', 'painting', 'pottery']);
    expect(CAST.pottery).toBe(Pip);
    expect(CAST.cake).toBe(BentoCake);
    expect(CAST.painting).toBe(Dot);
  });

  it('keeps the working names in one place', () => {
    expect(CAST_NAMES.pottery.name).toBe('Pip');
    expect(CAST_NAMES.cake.name).toBe('Bento');
    expect(CAST_NAMES.painting.name).toBe('Dot');
  });

  it('labels each character as a button that gives a fact', () => {
    expect(castLabel('pottery')).toBe('Pip, tap for a clay fact');
    expect(castLabel('cake')).toBe('Bento, tap for a cake fact');
    expect(castLabel('painting')).toBe('Dot, tap for a painting fact');
  });

  it('knows four moods', () => {
    expect([...MOODS]).toEqual(['happy', 'wink', 'wow', 'sleepy']);
  });
});
