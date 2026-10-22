import { describe, expect, it } from 'vitest';

import { mapsUrl } from './maps';

const BASE = 'https://www.google.com/maps/search/?api=1&query=';

describe('mapsUrl', () => {
  it('encodes a café name and area safely', () => {
    expect(mapsUrl('  Café Lumière, Clifton ')).toBe(
      `${BASE}${encodeURIComponent('Café Lumière, Clifton')}`,
    );
    expect(mapsUrl('A & B?#x')).toBe(`${BASE}A%20%26%20B%3F%23x`);
  });

  it('gives null for nothing to search', () => {
    expect(mapsUrl(null)).toBeNull();
    expect(mapsUrl(undefined)).toBeNull();
    expect(mapsUrl('')).toBeNull();
    expect(mapsUrl('   \n\t')).toBeNull();
  });

  it('cuts a long line to 120 characters', () => {
    expect(mapsUrl('x'.repeat(300))).toBe(`${BASE}${'x'.repeat(120)}`);
  });

  it('never splits an emoji when it cuts a long location, so the URL always encodes', () => {
    // 119 plain characters, then an emoji whose two UTF-16 halves straddle the cut.
    const location = `${'a'.repeat(119)}🌸 park`;

    expect(() => mapsUrl(location)).not.toThrow();
    const url = mapsUrl(location)!;
    expect(url).toContain(encodeURIComponent('🌸'));
    expect(() => decodeURIComponent(url.split('query=')[1]!)).not.toThrow();
  });

  it('counts characters the way a person does, not UTF-16 halves', () => {
    const url = mapsUrl('🌸'.repeat(200))!;
    const decoded = decodeURIComponent(url.split('query=')[1]!);

    expect(Array.from(decoded)).toHaveLength(120);
  });
});
