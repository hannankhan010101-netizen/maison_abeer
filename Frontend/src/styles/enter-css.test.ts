import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The recovery link's stylesheet: a slow stroke draw, and nothing else moving. */

const path = join(__dirname, 'units', 'enter.css');
const css = existsSync(path) ? readFileSync(path, 'utf8') : '';

const component = join(__dirname, '..', 'components', 'public', 'doors', 'EnterStates.tsx');

describe('enter.css', () => {
  it('exists and is loaded by the states that use it', () => {
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(component, 'utf8')).toContain("import '@/styles/units/enter.css'");
  });

  it('keeps every animation and transition behind the reduced-motion question', () => {
    const outside = css.replace(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[\s\S]*$/,
      '',
    );
    expect(outside).not.toMatch(/animation\s*:|transition\s*:|@keyframes/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*no-preference\)/);
  });

  it('animates only compositor-friendly properties', () => {
    const frames = [...css.matchAll(/@keyframes[^{]*\{([\s\S]*?)\}\s*\}/g)].map((m) => m[1]);
    expect(frames.length).toBeGreaterThan(0);
    for (const body of frames) {
      const props = [...body!.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const prop of props) {
        expect(['transform', 'opacity', 'clip-path', 'stroke-dashoffset']).toContain(prop);
      }
    }
  });

  it('forces nothing and fetches nothing', () => {
    expect(css).not.toMatch(/!important/);
    expect(css).not.toMatch(/@import|url\(/);
    expect(css).not.toMatch(/font-variation-settings|Fraunces/);
  });
});
