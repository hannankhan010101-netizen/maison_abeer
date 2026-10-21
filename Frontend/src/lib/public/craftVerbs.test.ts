import { describe, expect, it } from 'vitest';

import { CRAFT_VERBS, FALLBACK_VERB, verbsFor } from './craftVerbs';

describe('verbsFor', () => {
  it('rolls only its own verbs for a one-craft studio', () => {
    expect(verbsFor(['pottery'])).toEqual(['throw', 'centre', 'trim']);
  });

  it('interleaves the crafts so the roll changes craft every word', () => {
    expect(verbsFor(['cake', 'pottery'])).toEqual([
      'pipe',
      'throw',
      'frost',
      'centre',
      'swirl',
      'trim',
    ]);
  });

  it('says "make" for a studio with no classes', () => {
    expect(FALLBACK_VERB).toBe('make');
    expect(verbsFor([])).toEqual(['make']);
  });

  it('keeps every verb lowercase and at most six characters (the roll is width-locked)', () => {
    const all = [...Object.values(CRAFT_VERBS).flat(), FALLBACK_VERB];
    for (const verb of all) {
      expect(verb).toBe(verb.toLowerCase());
      expect(verb.length, verb).toBeLessThanOrEqual(6);
    }
  });
});
