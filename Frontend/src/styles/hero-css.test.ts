import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The hero's headline softens, and only softens.
 *
 * Fraunces has more axes than `SOFT`, but `wght`, `opsz` and `WONK` change glyph
 * widths: animating one reflows the line on every frame, so the letters would
 * shove their neighbours (and the buttons under the headline) about. This reads
 * the shipped stylesheet so that mistake fails here rather than on a phone.
 */

const css = readFileSync(join(__dirname, 'units', 'hero.css'), 'utf8');

/** Every `@keyframes name { … }` body, with nested braces balanced. */
function keyframeBlocks(source: string): { name: string; body: string }[] {
  const blocks: { name: string; body: string }[] = [];
  const opener = /@keyframes\s+([\w-]+)\s*\{/g;
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    let depth = 1;
    let index = opener.lastIndex;
    while (depth > 0 && index < source.length) {
      const char = source[index];
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      index += 1;
    }
    blocks.push({ name: match[1]!, body: source.slice(opener.lastIndex, index - 1) });
  }
  return blocks;
}

describe('hero.css', () => {
  const blocks = keyframeBlocks(css);

  it('has a keyframes block that animates SOFT from 0 to 100', () => {
    const soften = blocks.find((block) => /["']SOFT["']\s*0/.test(block.body));
    expect(soften, 'no @keyframes animates SOFT from 0').toBeDefined();
    expect(soften!.body).toMatch(/["']SOFT["']\s*100/);
  });

  it('never animates wght, opsz or WONK', () => {
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.body, `@keyframes ${block.name}`).not.toMatch(/wght|opsz|WONK/i);
    }
  });

  it('rests on SOFT 100 outside any keyframes', () => {
    let rest = css;
    for (const block of blocks) rest = rest.replace(block.body, '');
    expect(rest).toMatch(/font-variation-settings:\s*["']SOFT["']\s*100/);
  });
});

/** The body of every block opened by `opener`, nested braces balanced. */
function bodiesOf(source: string, opener: RegExp): string[] {
  const bodies: string[] = [];
  const pattern = new RegExp(opener.source, 'g');
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    let depth = 1;
    let index = pattern.lastIndex;
    while (depth > 0 && index < source.length) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      index += 1;
    }
    bodies.push(source.slice(pattern.lastIndex, index - 1));
  }
  return bodies;
}

/** The declarations of each top-level rule whose selector matches, in `source`. */
function declarationsFor(source: string, selector: RegExp): string[] {
  const found: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (let match = rule.exec(source); match; match = rule.exec(source)) {
    if (selector.test(match[1]!)) found.push(match[2]!);
  }
  return found;
}

describe('hero.css — the verb roll', () => {
  const comments = /\/\*[\s\S]*?\*\//g;
  const source = css.replace(comments, '');
  const noPreference = bodiesOf(
    source,
    /@media\s*\(\s*prefers-reduced-motion:\s*no-preference\s*\)\s*\{/,
  ).join('\n');

  it('clips the roll to its own box', () => {
    const roll = declarationsFor(source, /^\s*\.verb-roll\s*$/).join(';');
    expect(roll).toMatch(/overflow:\s*clip/);
  });

  it('transitions transform and opacity only, on the soft spring, under no-preference', () => {
    const rules = declarationsFor(noPreference, /\.verb-roll/).join(';');
    expect(rules, 'no verb-roll transition under no-preference').toMatch(/transition/);

    const properties = [...rules.matchAll(/transition-property:\s*([^;]+)/g)]
      .flatMap((match) => match[1]!.split(','))
      .map((value) => value.trim());
    expect(properties.length).toBeGreaterThan(0);
    for (const property of properties) expect(['transform', 'opacity']).toContain(property);
    expect(rules).not.toMatch(/transition:\s/);
    expect(rules).toMatch(/transition-timing-function:\s*var\(--ease-spring-soft\)/);
    expect(rules).toMatch(/transition-duration:\s*var\(--dur-slow\)/);
  });

  it('sets no transition on the roll outside no-preference', () => {
    let outside = source;
    for (const body of bodiesOf(
      source,
      /@media\s*\(\s*prefers-reduced-motion:\s*no-preference\s*\)\s*\{/,
    )) {
      outside = outside.replace(body, '');
    }
    expect(declarationsFor(outside, /\.verb-roll/).join(';')).not.toMatch(/transition/);
  });

  it('rolls in from below and out above', () => {
    const rest = declarationsFor(source, /\.verb-roll\s*>\s*\[data-verb\]\s*$/).join(';');
    const active = declarationsFor(source, /\.verb-roll\s*>\s*\[data-active\]\s*$/).join(';');
    const leaving = declarationsFor(source, /\.verb-roll\s*>\s*\[data-leaving\]\s*$/).join(';');
    expect(rest).toMatch(/translateY\(100%\)/);
    expect(rest).toMatch(/opacity:\s*0/);
    expect(active).toMatch(/translateY\(0\)/);
    expect(active).toMatch(/opacity:\s*1/);
    expect(leaving).toMatch(/translateY\(-100%\)/);
    expect(leaving).toMatch(/opacity:\s*0/);
  });
});
