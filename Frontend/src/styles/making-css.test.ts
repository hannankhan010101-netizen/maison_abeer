import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The making-of stylesheet draws its throwing lines on, and slides its beat
 * marker, only for a guest who has not asked for less motion. Everyone else
 * sees the lines already drawn and nothing moving.
 */

const css = readFileSync(join(__dirname, 'units', 'making.css'), 'utf8');

interface Block {
  start: number;
  end: number;
  body: string;
}

/** Every `@media (prefers-reduced-motion: no-preference) { … }` block, braces balanced. */
function motionBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const opener = /@media[^{]*\(prefers-reduced-motion:\s*no-preference\)[^{]*\{/g;
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    let depth = 1;
    let index = opener.lastIndex;
    while (depth > 0 && index < source.length) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      index += 1;
    }
    blocks.push({
      start: match.index,
      end: index,
      body: source.slice(opener.lastIndex, index - 1),
    });
  }
  return blocks;
}

describe('making.css', () => {
  const blocks = motionBlocks(css);
  const inside = blocks.map((block) => block.body).join('\n');
  const outside = blocks.reduceRight(
    (source, block) => source.slice(0, block.start) + source.slice(block.end),
    css,
  );

  it('draws the throwing lines on with stroke-dashoffset under no-preference', () => {
    expect(inside).toMatch(/\.making-line[^{]*\{[^}]*stroke-dashoffset/);
    expect(inside).toMatch(/transition[^;]*stroke-dashoffset/);
  });

  it('never hides or moves a throwing line outside that block', () => {
    expect(outside).not.toMatch(/stroke-dash(offset|array)/);
  });

  it('runs no transition or animation outside a no-preference block', () => {
    expect(outside).not.toMatch(/\b(transition|animation)\s*:/);
  });
});
