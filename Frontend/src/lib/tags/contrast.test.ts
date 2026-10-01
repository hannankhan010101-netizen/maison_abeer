import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AA_LARGE, AA_NORMAL, parseHex, ratio } from '@/styles/contrast';

import { THEMES, type TagTheme } from './themes';

/**
 * Guards the printed tent card against PRD §3.4 (WCAG 2.1 AA, 4.5:1 body
 * text) and WCAG 1.4.11 (3:1 for functional graphics).
 *
 * `src/styles/contrast.test.ts` cannot do this job. It resolves pairs through
 * `extractColorTokens()`, which only matches `--color-*` declarations in
 * tokens.css, and every colour on this card is a literal hex inside a Tailwind
 * arbitrary-value class in THEMES. That is deliberate — a printed object has
 * no colour scheme, so `.mocha` must not be able to reach these values (see
 * the comment on `tagClass`) — and it is exactly why the token validator is
 * blind to them. The result was sixteen failing text pairs shipping green
 * while ADR 0002's Enforcement section claimed "the palette cannot regress
 * without failing CI". It covered tokens.css and never covered this file.
 *
 * So: assert the shipped classes, in this file, independently of tokens.css.
 * Adding a theme means adding nothing — the table is driven off THEMES — and
 * adding a new rendered pairing means adding one row to PAIRS.
 *
 * Deliberately NOT asserted, because WCAG exempts them and the next reader
 * should not have to re-measure to find that out. All are inside
 * `aria-hidden="true"` and carry no information:
 *   - the ornament divider rules (`ruleClass`, 1.37-1.59:1)
 *   - the double keylines (opacity 0.16 / 0.14, 1.20-1.30:1)
 *   - the ornament glyphs, face and back (opacity 0.55, 2.18-2.26:1)
 *   - the QR placeholder (opacity 0.70, 2.82-3.50:1) — a stand-in for a code
 *     nothing here knows yet, not a scannable target
 *   - the table pill's own border (1.64-2.22:1); the pill's *label* carries the
 *     meaning and is asserted below.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Flatten `ink` drawn at `alpha` over an opaque `bg`.
 *
 * Tailwind's `opacity-*` composites the glyph in gamma-encoded sRGB against
 * whatever is behind it, so the colour a reader actually sees is never the
 * declared ink. Measuring the ink alone is how the back panel shipped at
 * 1.6:1 while every token pair in tokens.css was green.
 *
 * This belongs beside `extractBlock()` in `@/styles/contrast` — see the note
 * at the bottom of this file about why it is local for now.
 */
function composite(ink: string, bg: string, alpha: number): string {
  const front = parseHex(ink);
  const back = parseHex(bg);

  const channel = (index: 0 | 1 | 2) =>
    Math.round(alpha * front[index] + (1 - alpha) * back[index])
      .toString(16)
      .padStart(2, '0');

  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/**
 * Pull a hex literal out of a Tailwind arbitrary-value class.
 *
 * Returns the LAST match for the prefix, which matters for `to-[#...]`: a
 * gradient declares two stops and the deeper one is the worse surface on all
 * four themes. Every face failure found so far was on the `to-` stop.
 *
 * Throws rather than returning undefined. A theme that stops carrying a hex
 * for a role the card renders is a bug, not a row to skip.
 */
function arbitraryHex(classes: string, prefix: string): string {
  const matches = [...classes.matchAll(new RegExp(`${prefix}-\\[(#[0-9A-Fa-f]{6})\\]`, 'g'))];
  const last = matches.at(-1)?.[1];

  if (last === undefined) {
    throw new Error(`no ${prefix}-[#......] in "${classes}"`);
  }

  return last;
}

/** The face gradient's deeper stop — the worst case for ink on the face. */
const faceDark = (theme: TagTheme) => arbitraryHex(theme.tagClass, 'to');
/** The gradient's top stop, where the crease sits. */
const faceLight = (theme: TagTheme) => arbitraryHex(theme.tagClass, 'from');
const faceInk = (theme: TagTheme) => arbitraryHex(theme.tagClass, 'text');
const backPanel = (theme: TagTheme) => arbitraryHex(theme.backPanelClass, 'bg');
const backInk = (theme: TagTheme) => arbitraryHex(theme.backInkClass, 'text');

// ---------------------------------------------------------------------------
// Every pair the card renders
// ---------------------------------------------------------------------------

/** [what renders it and where, ink, backdrop, threshold] */
type Pair = readonly [string, (t: TagTheme) => string, (t: TagTheme) => string, number];

const PAIRS: readonly Pair[] = [
  // --- text on the face. Measured on the `to-` stop: the content column
  // spans the full face height, so any line can sit over either stop and the
  // deeper one is the one that decides. None of these is dimmed any more.
  ['"Hello, I\'m" eyebrow, 9px uppercase', faceInk, faceDark, AA_NORMAL],
  ['guest name, 12.5-21px display', faceInk, faceDark, AA_NORMAL],
  ['booking-answer subtext, 15px font-hand', faceInk, faceDark, AA_NORMAL],

  // The table pill is the one pair on this card that was already right, and
  // only because `bg-white/70` lightens the backdrop under it. Asserted so a
  // tweak to that fill cannot quietly take the margin away.
  [
    '"table N" pill label over bg-white/70',
    faceInk,
    (t) => composite('#FFFFFF', faceDark(t), 0.7),
    AA_NORMAL,
  ],

  // --- text on the tent's rear panel, which paints its own opaque fill over
  // the card gradient and so needs its own ink (themes.ts `backInkClass`).
  // "fold here" is a production instruction printed on the half that gets
  // creased, not decoration: it is the reason this panel has to be legible.
  ['"fold here", 7.5px uppercase on the rear panel', backInk, backPanel, AA_NORMAL],
  ['"Maison Abeer" wordmark, 8.5px on the rear panel', backInk, backPanel, AA_NORMAL],

  // --- functional graphics: 1.4.11's 3:1, not 4.5:1, but not exempt either.
  // TrimMarks is the "trim marks included" the UI promises and Crease is the
  // "cut, then fold in half"; the scissors and the fold follow these.
  [
    'trim-mark crosses @0.80 over the deeper face stop',
    (t) => composite(faceInk(t), faceDark(t), 0.8),
    faceDark,
    AA_LARGE,
  ],
  [
    'trim-mark crosses @0.80 over the rear panel',
    (t) => composite(faceInk(t), backPanel(t), 0.8),
    backPanel,
    AA_LARGE,
  ],
  [
    'crease rule and notches @0.80 at the fold seam',
    (t) => composite(faceInk(t), faceLight(t), 0.8),
    faceLight,
    AA_LARGE,
  ],
  [
    'crease rule and notches @0.80 over the rear panel',
    (t) => composite(faceInk(t), backPanel(t), 0.8),
    backPanel,
    AA_LARGE,
  ],
] as const;

describe.each(THEMES.map((theme) => [theme.id, theme] as const))('%s tent card', (_id, theme) => {
  it.each(PAIRS)('%s', (_label, ink, backdrop, threshold) => {
    expect(ratio(ink(theme), backdrop(theme))).toBeGreaterThanOrEqual(threshold);
  });
});

// ---------------------------------------------------------------------------
// The alphas the table above assumes
// ---------------------------------------------------------------------------

/**
 * PAIRS measures colours; these cases pin the alphas it measures them at.
 *
 * Without this, someone re-dims "fold here" to 0.35 to make the panel "quiet
 * again" and every assertion above still passes — it is reading themes.ts, not
 * the component. That is the precise regression this file exists to stop, so
 * read the shipped component and check it.
 */
const source = readFileSync(
  join(__dirname, '..', '..', 'components', 'domain', 'TagStudio.tsx'),
  'utf8',
);

/** The body of a top-level `function Name()` in the component source. */
function componentBody(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`TagStudio.tsx has no function ${name}`);

  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

/** Tailwind opacity utilities, ignoring anything inside a comment line. */
function opacities(body: string): string[] {
  const code = body
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

  return [...code.matchAll(/\bopacity-(\[?[\d.]+\]?)/g)].map((match) => match[1]!);
}

describe('rendered opacities', () => {
  it("leaves the rear panel's type undimmed", () => {
    // Not a style preference. Coquette's face ink reaches only 4.47:1 on its
    // own back panel at alpha 1.0, so when this panel inherited that ink there
    // was no opacity that passed; `backInkClass` plus no dimming is the whole
    // fix. Re-dimming the new inks to 0.85 gives 3.95-3.99:1.
    expect(opacities(componentBody('TentBackPanel'))).toEqual([]);
  });

  it('draws the crease and its notches at the same 0.80', () => {
    // Three strokes: the dashed rule plus a notch at each edge. 0.70 notches
    // left the ends of the fold mark fainter than the rule they terminate, and
    // failed 3:1 on three of four themes.
    expect(opacities(componentBody('Crease'))).toEqual(['80', '80', '80']);
  });

  it('draws the trim marks at 0.80', () => {
    expect(opacities(componentBody('TrimMarks'))).toEqual(['80']);
  });
});

/**
 * Not folded into `src/styles/contrast.test.ts` on purpose: tokens.css and
 * THEMES are separate sources of colour and should fail independently.
 *
 * `composite()` and `arbitraryHex()` are duplicated here rather than exported
 * from `@/styles/contrast` because that file is owned elsewhere in this
 * change. They belong there — the compositing bug is not specific to tag
 * themes — and moving them is a follow-up.
 */
