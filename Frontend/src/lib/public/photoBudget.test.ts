import { describe, expect, it } from 'vitest';

import { allocatePhotos, MARQUEE_MIN, MAX_USES, type PhotoBudget, usesOf } from './photoBudget';
import { coverFor, type CraftKind } from './studioPhotos';

const ALL: CraftKind[] = ['pottery', 'cake', 'painting'];

const INPUTS: CraftKind[][] = [
  [],
  ['pottery'],
  ['cake'],
  ['painting'],
  ['cake', 'pottery'],
  ['pottery', 'painting'],
  ['painting', 'cake'],
  ALL,
  ['painting', 'pottery', 'cake'],
];

const CASES = INPUTS.map((crafts) => [crafts.join('+') || 'none', crafts] as const);

function chapterPhotos(budget: PhotoBudget) {
  return Object.values(budget.chapters).flatMap((chapter) => [chapter.large, chapter.accent]);
}

describe('allocatePhotos', () => {
  it('gives nothing to a studio with no crafts', () => {
    const budget = allocatePhotos([]);
    expect(budget.fan).toEqual([]);
    expect(budget.chapters).toEqual({});
    expect(budget.wall).toEqual([]);
    expect(budget.marquee).toEqual([]);
  });

  it('one craft: fan 3, one chapter, wall 3, no marquee', () => {
    const budget = allocatePhotos(['pottery']);
    expect(budget.fan).toHaveLength(3);
    expect(budget.fan[0]).toBe(coverFor('pottery'));
    expect(budget.chapters.pottery).toBeDefined();
    expect(chapterPhotos(budget)).toHaveLength(2);
    expect(budget.wall).toHaveLength(3);
    expect(budget.marquee).toEqual([]);
  });

  it('two crafts: fan 3, chapters 4, wall 8, no marquee', () => {
    const budget = allocatePhotos(['cake', 'pottery']);
    expect(budget.fan).toHaveLength(3);
    expect(budget.fan.slice(0, 2)).toEqual([coverFor('cake'), coverFor('pottery')]);
    expect(chapterPhotos(budget)).toHaveLength(4);
    expect(budget.wall).toHaveLength(8);
    expect(budget.marquee).toEqual([]);
  });

  it('three crafts: fan 3, chapters 6, wall 8, marquee 7', () => {
    const budget = allocatePhotos(ALL);
    expect(budget.fan).toEqual(ALL.map(coverFor));
    expect(chapterPhotos(budget)).toHaveLength(6);
    expect(budget.wall).toHaveLength(8);
    expect(budget.marquee).toHaveLength(7);
    expect(budget.marquee.length).toBeGreaterThanOrEqual(MARQUEE_MIN);
  });

  it.each(CASES)('never uses a photo more than twice (%s)', (_name, crafts) => {
    const counts = [...usesOf(allocatePhotos(crafts)).values()];
    expect(Math.max(0, ...counts)).toBeLessThanOrEqual(MAX_USES);
  });

  it.each(CASES)('shows only the crafts taught, none twice in one group (%s)', (_name, crafts) => {
    const budget = allocatePhotos(crafts);
    for (const group of [budget.fan, budget.wall, budget.marquee]) {
      expect(new Set(group.map((item) => item.id)).size).toBe(group.length);
      for (const item of group) expect(crafts).toContain(item.craft);
    }
    for (const [craft, chapter] of Object.entries(budget.chapters)) {
      expect(chapter.large.craft).toBe(craft);
      expect(chapter.accent.craft).toBe(craft);
      expect(chapter.large).not.toBe(chapter.accent);
    }
  });

  it('keeps the chapters off the fan photos when there is an alternative', () => {
    for (const crafts of [ALL, ['cake', 'pottery'] as CraftKind[]]) {
      const budget = allocatePhotos(crafts);
      const fanIds = new Set(budget.fan.map((item) => item.id));
      for (const item of chapterPhotos(budget)) expect(fanIds.has(item.id)).toBe(false);
    }

    // One craft has four photos for five slots before the wall: the large
    // photo still avoids the fan.
    const one = allocatePhotos(['pottery']);
    expect(one.fan.map((item) => item.id)).not.toContain(one.chapters.pottery!.large.id);
  });

  it('counts every slot in usesOf', () => {
    const total = [...usesOf(allocatePhotos(ALL)).values()].reduce((sum, count) => sum + count, 0);
    expect(total).toBe(3 + 6 + 8 + 7);
  });
});
