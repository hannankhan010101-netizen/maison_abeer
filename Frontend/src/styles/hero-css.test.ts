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
