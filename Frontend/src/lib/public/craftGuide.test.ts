import { describe, expect, it } from 'vitest';

import { COMMON_FAQ, CRAFT_GUIDES, guideFor, visibleFaq, type GuideFaq } from './craftGuide';

/**
 * The craft knowledge the storefront teaches from.
 *
 * It is general craft knowledge only. Anything about the studio itself
 * (prices, ages, cancelling, when pieces are ready) belongs to the owner and is
 * an `owner` entry with no answer, which the page hides until she fills it in.
 */

const KINDS = ['pottery', 'cake', 'painting'] as const;

/** Words that would turn general knowledge into a studio promise or a price. */
const FORBIDDEN = /[$£€]|\bRs\.?\b|\bPKR\b|\bfree\b|\bincluded\b|guarantee|refund|\bdiscount\b/i;

function everyString(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => everyString(item, out));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((v) => everyString(v, out));
  return out;
}

describe('CRAFT_GUIDES', () => {
  for (const kind of KINDS) {
    describe(kind, () => {
      const guide = CRAFT_GUIDES[kind];

      it('is keyed by its own kind and has a title and a blurb', () => {
        expect(guide.kind).toBe(kind);
        expect(guide.title.length).toBeGreaterThan(2);
        expect(guide.blurb.length).toBeGreaterThan(10);
      });

      it('has enough to teach from', () => {
        expect(guide.makes.length).toBeGreaterThanOrEqual(3);
        expect(guide.tools.length).toBeGreaterThanOrEqual(4);
        expect(guide.steps.length).toBeGreaterThanOrEqual(4);
        expect(guide.steps.length).toBeLessThanOrEqual(5);
        expect(guide.tips.length).toBeGreaterThanOrEqual(3);
        expect(guide.funFacts.length).toBeGreaterThanOrEqual(3);
        expect(guide.bring.length).toBeGreaterThanOrEqual(4);
      });

      it('keeps ids unique and text short enough for a small card', () => {
        const ids = [...guide.tools, ...guide.steps, ...guide.faq].map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const step of guide.steps) expect(step.text.length).toBeLessThanOrEqual(140);
        for (const tool of guide.tools) expect(tool.does.length).toBeLessThanOrEqual(100);
        for (const fact of guide.funFacts) expect(fact.length).toBeLessThanOrEqual(140);
      });

      it('states no price, no promise and no policy', () => {
        for (const text of everyString(guide)) expect(text, text).not.toMatch(FORBIDDEN);
      });
    });
  }

  it('tells cake guests to mention allergies', () => {
    expect(CRAFT_GUIDES.cake.tips.join(' ')).toMatch(/allerg/i);
  });
});

describe('the questions', () => {
  const all: GuideFaq[] = [...COMMON_FAQ, ...KINDS.flatMap((kind) => CRAFT_GUIDES[kind].faq)];

  it('marks every unanswered entry as the owner’s to answer', () => {
    for (const entry of all) {
      if (entry.a === null) expect(entry.owner, entry.q).toBe(true);
    }
  });

  it('asks the studio-specific things and leaves them unanswered', () => {
    const owned = all.filter((entry) => entry.owner).map((entry) => entry.q.toLowerCase());
    for (const topic of ['pay', 'cancel', 'age', 'ready']) {
      expect(
        owned.some((q) => q.includes(topic)),
        topic,
      ).toBe(true);
    }
  });

  it('never shows an unanswered entry', () => {
    const shown = visibleFaq(all);
    expect(shown.every((entry) => typeof entry.a === 'string' && entry.a.length > 0)).toBe(true);
    expect(shown.length).toBeLessThan(all.length);
    expect(shown.length).toBeGreaterThan(0);
  });

  it('answers what the product itself can answer truthfully', () => {
    const answered = visibleFaq(all).map((entry) => entry.q.toLowerCase());
    expect(answered.some((q) => q.includes('allerg'))).toBe(true);
    expect(answered.some((q) => q.includes('full'))).toBe(true);
  });

  it('states no price, no promise and no policy in any answer', () => {
    for (const text of everyString(all)) expect(text, text).not.toMatch(FORBIDDEN);
  });
});

describe('guideFor', () => {
  it('returns the guide for each kind', () => {
    for (const kind of KINDS) expect(guideFor(kind)).toBe(CRAFT_GUIDES[kind]);
  });
});
