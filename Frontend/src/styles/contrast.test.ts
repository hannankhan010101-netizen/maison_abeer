import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AA_LARGE, AA_NORMAL, extractBlock, extractColorTokens, parseHex, ratio } from './contrast';

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

  // the two other shared fills. CraftStrip reached for raw --color-cocoa on
  // these and inverted in mocha (1.66:1 on sage, 1.12:1 on butter), because
  // the fill stays light while cocoa flips — the exact thing --color-on-rose
  // and --color-on-pink exist to prevent.
  ['craft tile label on sage', '--color-on-sage', '--color-sage'],
  ['craft tile label on butter', '--color-on-butter', '--color-butter'],

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

/**
 * The Wrapped story card, measured in its own scope.
 *
 * Adding full-opacity PAIRS rows would assert the wrong thing: these stops are
 * NOT the theme's stops on this card. `.wrapped-slide` pins four of them back
 * to their light values, which is precisely what makes the mocha flip
 * unreachable, so the pair has to be resolved through that scope to be the
 * pair the browser actually paints.
 */
describe.each([
  ['light', light],
  ['mocha', mocha],
])('Wrapped slide ink survives %s', (_themeName, tokens) => {
  const slide = { ...tokens, ...extractColorTokens(extractBlock(css, '.wrapped-slide'), tokens) };

  // Every stop src/lib/wrapped/stats.ts names across the nine slides.
  const stops = [
    '--color-blush',
    '--color-pink',
    '--color-rose',
    '--color-terra',
    '--color-terra-soft',
    '--color-sage',
    '--color-sage-soft',
    '--color-butter',
  ] as const;

  it.each(stops)('on %s', (stop) => {
    const ink = slide['--color-wrapped-ink'];
    const bg = slide[stop];

    if (ink === undefined || bg === undefined) {
      throw new Error(`${ink === undefined ? '--color-wrapped-ink' : stop} is missing`);
    }

    // Worst case is terra at 4.56:1; every other stop is 6.25:1 or better.
    expect(ratio(ink, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

/**
 * The one thing this suite structurally cannot see.
 *
 * Everything above measures token against token. An `opacity-*` utility
 * composites the rendered pixels toward whatever is behind them, which is a
 * colour no token names — so the chat bubble shipped at 2.13:1 with every
 * assertion in this file green, because `--color-on-rose` on `--color-rose` is
 * genuinely 4.80:1 and the 0.6 multiplier was applied to the *element*, moving
 * ink and fill toward the page together.
 *
 * Measuring that properly would mean knowing the page surface behind each
 * element, which a token file cannot tell us. So this guards the construct
 * instead: a gradient-filled bubble and a bare opacity utility on one element.
 * Variant-prefixed opacity (`disabled:opacity-40` on the send button) is
 * exempt — a disabled control is outside 1.4.3, and that is the only reason
 * opacity is defensible on a filled bubble at all.
 */
describe('element opacity on the chat bubbles', () => {
  const componentRoot = join(__dirname, '..', 'components');

  function tsxFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return tsxFiles(full);
      return entry.name.endsWith('.tsx') ? [full] : [];
    });
  }

  it('never fades a bubble and its ink together', () => {
    // Splitting on `className` bounds each chunk to one element's class list,
    // so a bubble here and an unrelated fade three elements down do not read
    // as the same offence.
    const offenders = tsxFiles(componentRoot).filter((file) =>
      readFileSync(file, 'utf8')
        .split('className')
        .some(
          (element) =>
            element.includes('--chat-bubble-') && /(?:^|[\s'"`])opacity-\d/.test(element),
        ),
    );

    expect(offenders).toEqual([]);
  });

  it('records what that construct costs, so the number is not re-derived by eye', () => {
    // 0.6 of cocoa AND 0.6 of rose, both over paper — the pending bubble as
    // it shipped.
    const blend = (fg: string, bg: string, alpha: number) => {
      const mix = (a: number, b: number) => Math.round(alpha * a + (1 - alpha) * b);
      const [fr, fg_, fb] = parseHex(fg);
      const [br, bg_, bb] = parseHex(bg);
      return `#${[mix(fr, br), mix(fg_, bg_), mix(fb, bb)]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`;
    };

    const ink = light['--color-on-rose']!;
    const fill = light['--color-rose']!;
    const page = light['--color-paper']!;

    expect(ratio(ink, fill)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(ratio(blend(ink, page, 0.6), blend(fill, page, 0.6))).toBeLessThan(AA_LARGE);
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
      // The ink for text sitting on a booking-page photo's own scrim — its
      // contrast comes from that fixed black gradient, not from the site
      // theme, so it deliberately does NOT flip with the rest of the ink
      // tokens (see the comment beside its definition in tokens.css).
      '--color-photo-ink',
      // The ink for the two Wrapped cards, for the same reason: those cards
      // are screenshot artifacts whose contrast comes from their own pinned
      // pastel gradient, not from the site theme. The `.wrapped-slide` scope
      // in tokens.css pins the surface to match, and the block below measures
      // the resulting pair in both themes.
      '--color-wrapped-ink',
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
