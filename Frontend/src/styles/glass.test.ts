import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AA_NORMAL, composite, extractBlock, extractColorTokens, ratio } from './contrast';

/**
 * Frosted glass lets the colour behind it through, so its text contrast is not
 * one number: it depends on what is underneath. `contrast.test.ts` measures a
 * token against a token and cannot see this. These tests resolve a glass
 * surface over each of the page's washes — the lightest and darkest things it
 * can sit on — and hold the ink to AA on every one.
 */

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
const root = extractBlock(css, ':root');
const colours = extractColorTokens(root);

function glass(): { rgb: string; alpha: number } {
  const match = /--glass-bg:\s*rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*(\d+)%\)/.exec(root);
  if (!match) throw new Error('--glass-bg is missing or not `rgb(r g b / n%)`');

  const [r, g, b] = [match[1], match[2], match[3]].map((v) =>
    Number(v).toString(16).padStart(2, '0'),
  );
  return { rgb: `#${r}${g}${b}`, alpha: Number(match[4]) / 100 };
}

describe('composite', () => {
  it('blends a colour over another by its alpha', () => {
    expect(composite('#ffffff', 0.5, '#000000')).toBe('#808080');
  });

  it('is the foreground at full alpha and the background at none', () => {
    expect(composite('#e2849e', 1, '#000000')).toBe('#e2849e');
    expect(composite('#e2849e', 0, '#123456')).toBe('#123456');
  });
});

describe('glass tokens', () => {
  it('is the page paper, made translucent', () => {
    expect(glass().rgb).toBe(colours['--color-paper']);
    expect(glass().alpha).toBeGreaterThan(0.5);
    expect(glass().alpha).toBeLessThan(1);
  });

  it('has a border and a blur', () => {
    expect(root).toMatch(/--glass-border:\s*rgb\(/);
    expect(root).toMatch(/--glass-blur:\s*\d+px/);
  });
});

/** The page and the four washes the backdrop paints — everything glass really sits on. */
const WASHES = [
  '--color-blush',
  '--color-butter-soft',
  '--color-sage-soft',
  '--color-terra-soft',
  '--color-buttercream',
] as const;

function over(ink: string, under: string): number {
  return ratio(colours[ink]!, composite(glass().rgb, glass().alpha, colours[under]!));
}

describe('text on glass', () => {
  describe.each(WASHES)('over %s', (under) => {
    it.each(['--color-cocoa', '--color-rose-ink', '--color-latte'] as const)(
      '%s meets AA',
      (ink) => {
        expect(over(ink, under), `${ink} on glass over ${under}`).toBeGreaterThanOrEqual(AA_NORMAL);
      },
    );
  });

  // `--color-pink` is a small fill (chips, the active tab), never a wash, so
  // muted text is not measured over it — it never sits there. The inks that do
  // appear near it are.
  describe('over the pink fill', () => {
    it.each(['--color-cocoa', '--color-rose-ink'] as const)('%s meets AA', (ink) => {
      expect(over(ink, '--color-pink'), `${ink} on glass over pink`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    });
  });

  it('is opaque enough that muted text clears AA over the darkest wash, with margin', () => {
    // 4.5 is the floor; a hair above it is one palette tweak from failing.
    expect(over('--color-latte', '--color-terra-soft')).toBeGreaterThanOrEqual(4.52);
  });
});
