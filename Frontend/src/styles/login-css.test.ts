import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The sign-in door's stylesheet, read as text. jsdom cannot paint the fan or
 * the drawn ring, so this pins the wiring; `e2e/login.spec.ts` looks at the page.
 */

const css = readFileSync(join(__dirname, 'units', 'login.css'), 'utf8');
const ticket = readFileSync(
  join(__dirname, '..', 'app', '(auth)', 'login', 'ShowcaseTicket.tsx'),
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

const NO_PREFERENCE = /media\s*\(prefers-reduced-motion:\s*no-preference\)/;

/** The stylesheet with every no-preference block cut out. */
function outsideMotionBlocks(source: string): string {
  let rest = source;
  for (const body of atRuleBodies(source, NO_PREFERENCE)) {
    rest = rest.replace(body, '');
  }
  return rest;
}

describe('login.css', () => {
  it('is imported by the ticket', () => {
    expect(ticket).toMatch(/import ['"]@\/styles\/units\/login\.css['"]/);
  });

  it('has motion, and keeps all of it under prefers-reduced-motion: no-preference', () => {
    expect(atRuleBodies(css, NO_PREFERENCE).join('\n')).toMatch(/animation(-name)?:/);
    const rest = outsideMotionBlocks(css);
    expect(rest).not.toMatch(/animation(-name)?\s*:/);
    expect(rest).not.toMatch(/@keyframes/);
    expect(rest).not.toMatch(/transition(-property)?\s*:/);
  });

  it('never sets font-variation-settings', () => {
    expect(css).not.toMatch(/font-variation-settings/);
  });

  it('pulls in no other stylesheet', () => {
    expect(css).not.toMatch(/@import/);
  });
});
