import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AA_NORMAL, extractBlock, extractColorTokens, ratio } from './contrast';

/**
 * Guards the PRD's accessibility requirement (§3.4: WCAG 2.1 AA, 4.5:1 body
 * text) against the brand's pastel palette.
 *
 * This reads the shipped tokens.css directly. Changing a colour without
 * checking its contrast fails CI rather than shipping an unreadable chip.
 */

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');

const light = extractColorTokens(extractBlock(css, ':root'));
const mocha = { ...light, ...extractColorTokens(extractBlock(css, '.mocha'), light) };

/** [label, foreground token, background token] */
type Pair = readonly [string, string, string];

/**
 * Every foreground/background combination the UI actually renders.
 * Adding a component that introduces a new pairing means adding it here.
 */
const PAIRS: readonly Pair[] = [
  // body and muted text on both surfaces
  ['body text on app background', '--color-cocoa', '--color-buttercream'],
  ['body text on card', '--color-cocoa', '--color-paper'],
  ['muted text on app background', '--color-latte', '--color-buttercream'],
  ['muted text on card', '--color-latte', '--color-paper'],

  // handwritten accents (Caveat) — below the large-text threshold, so AA normal
  ['rose accent text on card', '--color-rose-ink', '--color-paper'],
  ['rose accent text on app background', '--color-rose-ink', '--color-buttercream'],
  ['rose accent text on blush fill', '--color-rose-ink', '--color-blush'],

  // chat: the host's own messages sit on a blush fill so their voice is
  // recognisable without borrowing the broadcast gradient
  ['host message body on blush bubble', '--color-cocoa', '--color-blush'],

  // filled controls — the prototype used white here and failed badly
  ['primary button label', '--color-on-rose', '--color-rose'],
  ['active nav label', '--color-on-pink', '--color-pink'],

  // class-type chips — these encode which craft a session is
  ['pottery chip', '--color-terra-deep', '--color-terra-soft'],
  ['ceramic painting chip', '--color-sage-ink', '--color-sage-soft'],
  ['delight chip', '--color-butter-ink', '--color-butter-soft'],

  // the allergy chip — operationally critical, not decorative (PRD §2.4)
  ['allergy chip', '--color-danger', '--color-danger-soft'],
] as const;

describe.each([
  ['light', light],
  ['mocha', mocha],
])('%s theme meets WCAG AA', (themeName, tokens) => {
  it.each(PAIRS)('%s', (_label, fgToken, bgToken) => {
    const fg = tokens[fgToken];
    const bg = tokens[bgToken];

    if (fg === undefined || bg === undefined) {
      throw new Error(
        `${fg === undefined ? fgToken : bgToken} is missing from the ${themeName} theme`,
      );
    }

    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('token file integrity', () => {
  it('defines every token the pair table references', () => {
    const referenced = new Set(PAIRS.flatMap(([, fg, bg]) => [fg, bg]));
    const missing = [...referenced].filter((token) => !(token in light));

    expect(missing).toEqual([]);
  });

  it('overrides every themeable colour in mocha', () => {
    // Tokens that are intentionally shared across themes (pure fills whose
    // paired ink is overridden instead).
    const sharedByDesign = new Set([
      '--color-rose',
      '--color-terra',
      '--color-sage',
      '--color-butter',
      '--color-rose-deep',
    ]);

    const mochaOverrides = extractColorTokens(extractBlock(css, '.mocha'));
    const inkAndSurface = Object.keys(light).filter(
      (t) =>
        !sharedByDesign.has(t) &&
        (t.includes('cocoa') ||
          t.includes('latte') ||
          t.includes('paper') ||
          t.includes('buttercream') ||
          t.includes('line') ||
          t.includes('ink') ||
          t.includes('danger') ||
          t.includes('soft')),
    );

    const notOverridden = inkAndSurface.filter((t) => !(t in mochaOverrides));
    expect(notOverridden).toEqual([]);
  });

  it('keeps the 44px minimum tap target defined', () => {
    expect(css).toMatch(/--tap-min:\s*44px/);
  });

  it('respects prefers-reduced-motion', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});
