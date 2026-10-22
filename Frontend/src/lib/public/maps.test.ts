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
});
