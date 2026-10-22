import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The cast sits in the first screen, so its stylesheet promises three things:
 * every motion exists only for a guest who has not asked for less of it, it
 * moves only transform and opacity, and every box is a fixed size so nothing
 * around it shifts.
 */

const css = readFileSync(join(__dirname, 'units', 'characters.css'), 'utf8');

function blocks(source: string, opener: RegExp): { start: number; end: number; body: string }[] {
  const found: { start: number; end: number; body: string }[] = [];
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    let depth = 1;
    let index = opener.lastIndex;
    while (depth > 0 && index < source.length) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      index += 1;
    }
    found.push({ start: match.index, end: index, body: source.slice(opener.lastIndex, index - 1) });
  }
  return found;
}

const motion = blocks(css, /@media[^{]*\(prefers-reduced-motion:\s*no-preference\)[^{]*\{/g);
const keyframes = blocks(css, /@keyframes\s+[\w-]+\s*\{/g);

function outsideMotion(): string {
  let rest = css;
  for (const block of motion) rest = rest.replace(css.slice(block.start, block.end), '');
  return rest;
}

describe('characters.css', () => {
  it('floats, squishes and pops only under no-preference', () => {
    expect(motion.length).toBeGreaterThan(0);
    const inside = motion.map((block) => block.body).join('\n');
    expect(inside).toMatch(/\.character-float\s*\{[^}]*animation:/);
    expect(inside).toMatch(/\.character-squish\s*\{[^}]*animation:/);
    expect(inside).toMatch(/\.character-pop[^{]*\{[^}]*animation:/);
    const rest = outsideMotion();
    expect(rest).not.toMatch(/animation\s*:/);
    expect(rest).not.toMatch(/transition\s*:/);
    expect(rest).not.toMatch(/@keyframes/);
  });

  it('animates only transform and opacity', () => {
    expect(keyframes.length).toBeGreaterThan(0);
    for (const block of keyframes) {
      const properties = [...block.body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]);
      for (const property of properties) expect(['transform', 'opacity']).toContain(property);
    }
  });

  it('uses the shared springs for the press and the pop', () => {
    expect(css).toMatch(/var\(--spring-squish\)/);
    expect(css).toMatch(/var\(--spring-pop\)/);
  });

  it('holds the float still while paused', () => {
    expect(css).toMatch(/\[data-paused\][^{]*\{[^}]*animation-play-state:\s*paused/);
  });

  it('gives every character a fixed pixel box of at least 44px', () => {
    const sizes = [...css.matchAll(/\.character\s*\{[^}]*\}/g)].join('\n');
    const width = sizes.match(/width:\s*(\d+)px/);
    const height = sizes.match(/height:\s*(\d+)px/);
    expect(Number(width?.[1])).toBeGreaterThanOrEqual(44);
    expect(Number(height?.[1])).toBeGreaterThanOrEqual(44);
    expect(css).not.toMatch(/\b\d+(vw|vh|svh|dvh)\b/);
  });

  it('keeps the speech sticker in the page when it is closed, for the live region', () => {
    expect(css).toMatch(/\.character-speech\s*\{[^}]*visibility:\s*hidden/);
    expect(css).toMatch(/\.character-speech\[data-open\]\s*\{[^}]*visibility:\s*visible/);
  });
});
