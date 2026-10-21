import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The pill's glass, its moving light and its settling name, read from the
 * shipped stylesheet. jsdom cannot paint any of it, so this pins the wiring;
 * `e2e/atmosphere.spec.ts` measures the pill in a browser.
 */

const css = readFileSync(join(__dirname, 'units', 'nav.css'), 'utf8');
const component = readFileSync(
  join(__dirname, '..', 'components', 'public', 'nav', 'FloatingPill.tsx'),
  'utf8',
);

/** The body of every at-rule whose prelude matches, with nested braces balanced. */
function atRuleBodies(source: string, prelude: RegExp): string[] {
  const bodies: string[] = [];
  const opener = new RegExp(`@(?:${prelude.source})[^{]*\\{`, 'g');
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    let depth = 1;
    let index = opener.lastIndex;
    while (depth > 0 && index < source.length) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      index += 1;
    }
    bodies.push(source.slice(opener.lastIndex, index - 1));
  }
  return bodies;
}

/** The stylesheet with every no-preference block cut out. */
function outsideMotionBlocks(source: string): string {
  let rest = source;
  for (const body of atRuleBodies(source, /media\s*\(prefers-reduced-motion:\s*no-preference\)/)) {
    rest = rest.replace(body, '');
  }
  return rest;
}

const motion = atRuleBodies(css, /media\s*\(prefers-reduced-motion:\s*no-preference\)/).join('\n');

describe('nav.css', () => {
  it('is imported by the pill', () => {
    expect(component).toMatch(/import ['"]@\/styles\/units\/nav\.css['"]/);
  });

  it('registers --pill-light as an angle, so the browser can animate it', () => {
    const rule = /@property\s+--pill-light\s*\{([^}]*)\}/.exec(css);
    expect(rule, '@property --pill-light is missing').not.toBeNull();
    expect(rule![1]).toMatch(/syntax:\s*['"]<angle>['"]/);
    expect(rule![1]).toMatch(/inherits:\s*false/);
    expect(rule![1]).toMatch(/initial-value:\s*0deg/);
  });

  it('draws the border light as a conic gradient from --pill-light through a mask', () => {
    expect(css).toMatch(
      /\.floating-pill::(before|after)\s*\{[^}]*conic-gradient\(\s*from\s+var\(--pill-light\)/,
    );
    expect(css).toMatch(/\.floating-pill::(before|after)\s*\{[^}]*mask(-composite)?:/);
  });

  it('drives the sweep from the page scroll, only where scroll timelines exist', () => {
    const supported = atRuleBodies(css, /supports\s*\(animation-timeline:\s*scroll\(\)\)/).join(
      '\n',
    );
    expect(supported).toMatch(/animation-timeline:\s*scroll\(root\)/);
    expect(outsideMotionBlocks(css)).not.toMatch(/animation-timeline/);
  });

  it('settles the name from 1.6x to 1x on the soft spring, from md', () => {
    const keyframes = /@keyframes\s+([\w-]+)\s*\{[^@]*scale\(1\.6\)[^@]*scale\(1\)/.exec(motion);
    expect(keyframes, 'no keyframes scale from 1.6 to 1').not.toBeNull();
    const fromMd = atRuleBodies(motion, /media\s*\(min-width:\s*(48rem|768px)\)/).join('\n');
    expect(fromMd).toMatch(/\.floating-pill__name\s*\{[^}]*var\(--ease-spring-soft\)/);
    expect(fromMd).toContain(keyframes![1]!);
  });

  it('keeps every animation under prefers-reduced-motion: no-preference', () => {
    const rest = outsideMotionBlocks(css);
    expect(rest).not.toMatch(/animation(-name)?:/);
    expect(rest).not.toMatch(/@keyframes/);
    expect(rest).not.toMatch(/transition:/);
  });

  it('carries the inner highlight and never uses !important', () => {
    expect(css + component).toMatch(/inset[ _]0[ _]0[ _]0[ _]1px[ _]var\(--glass-border\)/);
    expect(css).not.toMatch(/!important/);
  });
});
