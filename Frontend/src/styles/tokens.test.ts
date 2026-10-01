import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import manifest from '../app/manifest';
import { extractBlock, extractColorTokens } from './contrast';
import { THEME_COLOR } from './themeColor';

/**
 * The touch tokens, guarded in the file that owns them.
 *
 * `--tab-bar-host` and `--tab-bar-guest` are not decoration: three separate
 * things are positioned from them — the bar's own height, the "More" sheet
 * pinned above it, and the toast, which is rendered as a sibling of the shell
 * and so cannot measure the bar at runtime. A number small enough to be hard
 * to hit would be wrong in all three places at once, and `e2e/mobile.spec.ts`
 * only measures what a browser laid out, which is too late to explain why.
 */

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
const root = extractBlock(css, ':root');

function px(token: string): number {
  const match = root.match(new RegExp(`${token}:\\s*(\\d+(?:\\.\\d+)?)px`));
  if (!match) throw new Error(`${token} is missing from tokens.css, or is not a px value`);
  return Number(match[1]);
}

describe('touch tokens', () => {
  it('keeps the tap floor at the PRD’s 44px', () => {
    // PRD §3.4 — in-studio use with clay-dusted fingers.
    expect(px('--tap-min')).toBeGreaterThanOrEqual(44);
  });

  it('makes both tab bars at least as tall as the tap floor', () => {
    const floor = px('--tap-min');

    expect(px('--tab-bar-host')).toBeGreaterThanOrEqual(floor);
    expect(px('--tab-bar-guest')).toBeGreaterThanOrEqual(floor);
  });

  it('gives the host bar the taller target, since it carries five tabs', () => {
    // Five tabs across the narrowest phone leaves each one about 68px wide, so
    // the extra height is what keeps the target square-ish rather than a
    // sliver that needs an accurate thumb.
    expect(px('--tab-bar-host')).toBeGreaterThan(px('--tab-bar-guest'));
  });

  it('names the bar border, which anything pinned above a bar has to add', () => {
    /*
     * The two bar tokens are the bar's *content* height; its box is that plus
     * `border-t`. The "More" sheet was pinned at the height alone and so sat on
     * the border — overlapY exactly 1.0 against an occlusion guard that
     * rejected above 1. `px()` throwing on a missing token is the right
     * failure: a renamed token would make the sheet's `calc()` resolve to
     * nothing rather than to a wrong number.
     */
    expect(px('--tab-bar-border')).toBeGreaterThan(0);
  });
});

/**
 * The two colours no stylesheet can supply.
 *
 * `--color-buttercream` is restated as a literal in `styles/themeColor.ts`
 * because the pre-paint init script runs before any CSS is parsed and the
 * manifest is serialised to JSON, where a `var()` means nothing. That makes
 * drift invisible to `contrast.test.ts`, which reads tokens.css alone: warm the
 * cream in the stylesheet and every other test still passes while the browser
 * chrome and the install splash keep painting the old one — a visible seam at
 * the top of the installed app, which decision 10 of ADR 0003 points out is the
 * only thing framing it.
 */
describe('theme colour', () => {
  const light = extractColorTokens(extractBlock(css, ':root'));
  const mocha = { ...light, ...extractColorTokens(extractBlock(css, '.mocha'), light) };

  it('keeps THEME_COLOR in step with --color-buttercream in both themes', () => {
    // Lowercased on both sides: tokens.css writes `#fff8f0` and `THEME_COLOR`
    // writes `#FFF8F0`, and normalising one side only would leave this
    // sensitive to a casing edit that changes nothing.
    expect(THEME_COLOR.light.toLowerCase()).toBe(light['--color-buttercream']?.toLowerCase());
    expect(THEME_COLOR.mocha.toLowerCase()).toBe(mocha['--color-buttercream']?.toLowerCase());
  });

  it('paints the install splash in the same cream as the page', () => {
    const m = manifest();

    expect(m.background_color).toBe(THEME_COLOR.light);
    expect(m.theme_color).toBe(THEME_COLOR.light);
  });
});
