import { describe, expect, it } from 'vitest';

import type { PublicMemory } from './api';
import { buildMemories, layoutSpans, MAX_TILES, packs } from './memories';
import { allocatePhotos } from './photoBudget';
import { STUDIO_PHOTOS, type CraftKind } from './studioPhotos';

const studio = (n: number, craft: PublicMemory['craft'] = null): PublicMemory[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    photo_url: `https://example.com/${i}.jpg`,
    caption: `caption ${i}`,
    craft,
  }));

describe('buildMemories', () => {
  it('shows the craft photography, framed as what you will make, when the studio has no memories', () => {
    const built = buildMemories(['pottery'], undefined);

    expect(built.heading).toBe("What you'll make here");
    expect(built.items.length).toBeGreaterThan(0);
    expect(built.items.every((item) => item.origin === 'craft')).toBe(true);
    expect(built.items.every((item) => item.craft === 'pottery')).toBe(true);
  });

  it.each([
    [['pottery'] as CraftKind[], 3],
    [['cake', 'pottery'] as CraftKind[], 8],
    [['pottery', 'cake', 'painting'] as CraftKind[], 8],
  ])('takes the photos the budget leaves the wall (%j)', (crafts, count) => {
    const built = buildMemories(crafts, undefined);
    expect(built.items).toHaveLength(count);
    expect(built.items.map((item) => item.id)).toEqual(
      allocatePhotos(crafts).wall.map((photo) => photo.id),
    );
  });

  it('lets studio memories win over the budget', () => {
    const built = buildMemories(['pottery'], studio(5));
    expect(built.items.map((item) => item.id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
  });

  it('treats an empty list the same as none', () => {
    expect(buildMemories(['cake'], []).heading).toBe("What you'll make here");
  });

  it('only shows crafts on offer', () => {
    const built = buildMemories(['cake', 'painting'], undefined);
    expect(new Set(built.items.map((item) => item.craft))).toEqual(new Set(['cake', 'painting']));
  });

  it("uses the manifest's own captions and nothing invented", () => {
    const captions = new Set(STUDIO_PHOTOS.map((photo) => photo.caption));
    const built = buildMemories(['pottery', 'cake', 'painting'], undefined);
    expect(built.items.every((item) => captions.has(item.caption))).toBe(true);
  });

  it('shows only the studio memories, never stock, once there are any', () => {
    const built = buildMemories(['pottery', 'cake'], studio(2, 'cake'));

    expect(built.heading).toBe('Memories from the studio');
    expect(built.items).toHaveLength(2);
    expect(built.items.every((item) => item.origin === 'studio')).toBe(true);
    expect(built.items[0]).toMatchObject({
      caption: 'caption 0',
      craft: 'cake',
      photo: { src: 'https://example.com/0.jpg', alt: 'caption 0' },
    });
  });

  it('keeps a studio memory even when it is of no craft', () => {
    expect(buildMemories([], studio(1)).items).toHaveLength(1);
  });

  it('has nothing to show with no crafts and no memories', () => {
    expect(buildMemories([], undefined).items).toEqual([]);
  });

  it('caps the mosaic', () => {
    expect(buildMemories([], studio(12)).items).toHaveLength(MAX_TILES);
    expect(MAX_TILES).toBe(8);
  });
});

describe('layoutSpans', () => {
  // A few orientation mixes, so the result is not tuned to one pattern.
  const patterns = [
    (i: number) => i % 2 === 0,
    (i: number) => i % 3 === 0,
    (i: number) => i % 2 === 1,
    () => true,
    () => false,
    (i: number) => i < 3,
  ];

  for (let n = 1; n <= MAX_TILES; n += 1) {
    it(`leaves no empty cell for ${n} tiles, on the desktop and phone grids`, () => {
      for (const portrait of patterns) {
        const items = Array.from({ length: n }, (_, i) => ({ portrait: portrait(i) }));
        const { spans, cells } = layoutSpans(items);

        expect(spans).toHaveLength(n);
        expect(cells % 4).toBe(0);
        expect(packs(spans, 4)).toBe(true);
        expect(packs(spans, 2)).toBe(true);
      }
    });
  }

  it('keeps a portrait photo tall when the grid allows it', () => {
    const { spans } = layoutSpans([
      { portrait: true },
      { portrait: false },
      { portrait: false },
      { portrait: true },
    ]);
    expect(spans[0]!.h).toBe(2);
  });

  it('is empty for nothing', () => {
    expect(layoutSpans([])).toEqual({ spans: [], cells: 0 });
  });

  it('packs the visible set after a filter the same way', () => {
    // Three of eight visible, one portrait.
    const { spans, cells } = layoutSpans([
      { portrait: false },
      { portrait: true },
      { portrait: false },
    ]);
    expect(cells % 4).toBe(0);
    expect(packs(spans, 4) && packs(spans, 2)).toBe(true);
  });

  it('detects a gap', () => {
    expect(packs([{ w: 1, h: 1 }], 4)).toBe(false);
  });
});
