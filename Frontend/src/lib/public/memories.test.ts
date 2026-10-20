import { describe, expect, it } from 'vitest';

import type { PublicMemory } from './api';
import { buildMemories, MAX_TILES } from './memories';
import { STUDIO_PHOTOS } from './studioPhotos';

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
