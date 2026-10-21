import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The receipt's stylesheet: a torn foot drawn by a mask, nothing forced. */

const path = join(__dirname, 'units', 'receipt.css');
const css = existsSync(path) ? readFileSync(path, 'utf8') : '';

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return match?.[1] ?? '';
}

describe('receipt.css', () => {
  it('exists', () => {
    expect(existsSync(path)).toBe(true);
  });

  it('tears the edge with a mask, not an image', () => {
    const edge = rule('.receipt__edge');
    expect(edge).toMatch(/(^|[\s;])mask-image\s*:/);
    expect(edge).not.toMatch(/url\(/);
  });

  it('forces nothing', () => {
    expect(css).not.toMatch(/!important/);
  });

  it('keeps any motion behind the reduced-motion question', () => {
    const outside = css.replace(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[\s\S]*$/,
      '',
    );
    expect(outside).not.toMatch(/animation\s*:|transition\s*:/);
  });
});
