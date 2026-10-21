import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The pop-up cards' stylesheet: still by default, a small photo lean with motion allowed. */

const path = join(__dirname, 'units', 'popups.css');
const css = existsSync(path) ? readFileSync(path, 'utf8') : '';

const MOTION = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{([\s\S]*)\}\s*$/;
const inside = MOTION.exec(css)?.[1] ?? '';
const outside = css.replace(MOTION, '');

describe('popups.css', () => {
  it('exists and is imported by the card', () => {
    expect(existsSync(path)).toBe(true);
    const card = readFileSync(
      join(__dirname, '..', 'components', 'public', 'booking', 'PopupCard.tsx'),
      'utf8',
    );
    expect(card).toContain("import '@/styles/units/popups.css'");
  });

  it('keeps every transition and transform change inside the motion block', () => {
    expect(inside).not.toBe('');
    expect(outside).not.toMatch(/animation\s*:|transition\s*:|scale\(/);
  });

  it('is gated by the motion tier flag', () => {
    for (const selector of inside.match(/[^{}]+(?=\{)/g) ?? []) {
      expect(selector).toContain('[data-popups-motion]');
    }
  });

  it('animates only transform', () => {
    for (const [, props] of inside.matchAll(/transition\s*:\s*([^;]+);/g)) {
      for (const part of props!.replace(/\([^)]*\)/g, '').split(',')) {
        expect(part.trim().split(/\s+/)[0]).toBe('transform');
      }
    }
  });
});
