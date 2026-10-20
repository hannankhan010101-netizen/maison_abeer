import { existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CRAFT_COPY,
  STUDIO_PHOTOS,
  accentPhotoFor,
  chapterPhotoFor,
  coverFor,
  craftOf,
  craftsIn,
  fanPhotos,
  photosFor,
  photosOfCrafts,
  type CraftKind,
} from './studioPhotos';

const PUBLIC = join(__dirname, '../../../public');

/** Pixel size of a JPEG, read from its header — no image library needed. */
function jpegSize(path: string): { width: number; height: number } {
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(64 * 1024);
    const read = readSync(fd, head, 0, head.length, 0);
    let offset = 2; // past the SOI marker

    while (offset + 9 < read) {
      if (head[offset] !== 0xff) throw new Error(`not a marker at ${offset} in ${path}`);
      const marker = head[offset + 1]!;
      const length = head.readUInt16BE(offset + 2);

      // SOF0..SOF15, except the three that are not frame headers.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: head.readUInt16BE(offset + 5), width: head.readUInt16BE(offset + 7) };
      }

      offset += 2 + length;
    }

    throw new Error(`no frame header in ${path}`);
  } finally {
    closeSync(fd);
  }
}

const CRAFTS: CraftKind[] = ['pottery', 'cake', 'painting'];

describe('the studio photo manifest', () => {
  it.each(STUDIO_PHOTOS.map((item) => [item.id, item] as const))(
    '%s points at real files whose size it states',
    (_id, item) => {
      const full = join(PUBLIC, item.src);
      const small = join(PUBLIC, item.small);

      expect(existsSync(full), full).toBe(true);
      expect(existsSync(small), small).toBe(true);

      // A wrong size is layout shift on every load: the browser reserves the
      // wrong box, then the photo arrives and moves everything beneath it.
      expect(jpegSize(full)).toEqual({ width: item.width, height: item.height });
      expect(jpegSize(small).width).toBe(800);
    },
  );

  it('keeps the phone copy well under the full file', () => {
    for (const item of STUDIO_PHOTOS) {
      expect(statSync(join(PUBLIC, item.small)).size).toBeLessThan(
        statSync(join(PUBLIC, item.src)).size,
      );
    }
  });

  it('describes every photo, and gives each a distinct id', () => {
    expect(new Set(STUDIO_PHOTOS.map((item) => item.id)).size).toBe(STUDIO_PHOTOS.length);

    for (const item of STUDIO_PHOTOS) {
      expect(item.alt.length, item.id).toBeGreaterThan(15);
      expect(item.caption.length, item.id).toBeGreaterThan(0);
      expect(item.tone, item.id).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('has enough of every craft to cast a cover, a chapter and an accent', () => {
    for (const craft of CRAFTS) {
      expect(photosFor(craft).length, craft).toBeGreaterThanOrEqual(3);

      const parts = [coverFor(craft), chapterPhotoFor(craft), accentPhotoFor(craft)];
      expect(new Set(parts.map((item) => item.id)).size, `${craft} reuses a photo`).toBe(3);
      for (const part of parts) expect(part.craft).toBe(craft);
    }
  });

  it('has the studio’s voice for every craft', () => {
    for (const craft of CRAFTS) {
      expect(CRAFT_COPY[craft].eyebrow.length).toBeGreaterThan(0);
      expect(CRAFT_COPY[craft].blurb.length).toBeGreaterThan(40);
    }
  });
});

describe('craftOf', () => {
  it('reads the app’s own colour language', () => {
    expect(craftOf('terra')).toBe('pottery');
    expect(craftOf('sage')).toBe('painting');
    expect(craftOf('pink')).toBe('cake');
  });

  it('treats anything unrecognised as the default pink', () => {
    expect(craftOf('butter')).toBe('cake');
    expect(craftOf('mauve')).toBe('cake');
  });
});

describe('choosing photos for the crafts on offer', () => {
  it('finds the distinct crafts, first-seen order', () => {
    expect(craftsIn(['sage', 'terra', 'sage', 'pink'])).toEqual(['painting', 'pottery', 'cake']);
  });

  it('never includes a photo of a craft that is not on offer', () => {
    const only = photosOfCrafts(['pottery']);

    expect(only.length).toBeGreaterThan(0);
    expect(only.every((item) => item.craft === 'pottery')).toBe(true);
  });

  it('leads with each craft’s cover', () => {
    const pool = photosOfCrafts(['cake', 'painting']);

    expect(pool[0]).toBe(coverFor('cake'));
    expect(pool[1]).toBe(coverFor('painting'));
  });

  it('fills the fan to exactly the count, even for a one-craft studio', () => {
    const fan = fanPhotos(['pottery'], 3);

    expect(fan).toHaveLength(3);
    expect(fan.every((item) => item.craft === 'pottery')).toBe(true);
    expect(fan[0]).toBe(coverFor('pottery'));
  });

  it('gives an empty fan when no craft is known', () => {
    expect(fanPhotos([], 3)).toEqual([]);
  });
});
