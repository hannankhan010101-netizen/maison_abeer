import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The Craft Corner is static and complete by default. Its reveals, the
 * scroll-linked steps and the tool card pop exist only for a guest who has not
 * asked for less motion, and they animate only transform and opacity.
 */

const css = readFileSync(join(__dirname, 'units', 'corner.css'), 'utf8');

interface Block {
  start: number;
  end: number;
  body: string;
}

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

describe('corner.css', () => {
  const blocks = motionBlocks(css);
  const inside = blocks.map((block) => block.body).join('\n');
  const outside = blocks.reduceRight(
    (source, block) => source.slice(0, block.start) + source.slice(block.end),
    css,
  );

  it('has the reveal, scroll-linked and pop rules under no-preference', () => {
    expect(inside).toMatch(/\.corner-steps\.is-reveal[^{]*\{[^}]*animation/);
    expect(inside).toMatch(/\.corner-steps\.is-scroll[^{]*\{[^}]*animation-timeline:\s*view\(\)/);
    expect(inside).toMatch(/\.corner-tool-card[^{]*\{[^}]*animation/);
  });

  it('runs no transition or animation outside a no-preference block', () => {
    expect(outside).not.toMatch(/\b(transition|animation)(-[a-z]+)?\s*:/);
    expect(outside).not.toMatch(/@keyframes/);
  });

  it('animates only transform and opacity', () => {
    const keyframes = inside.match(/@keyframes[^{]*\{([^{}]*\{[^}]*\})*[^}]*\}/g) ?? [];
    expect(keyframes.length).toBeGreaterThan(0);
    for (const frame of keyframes) {
      const props = [...frame.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const prop of props) expect(['transform', 'opacity']).toContain(prop);
    }
    const transitions = [...inside.matchAll(/transition(?:-property)?\s*:([^;]+);/g)];
    for (const [, value] of transitions)
      expect(value).not.toMatch(/\b(width|height|top|left|margin|padding)\b/);
  });

  it('gives every tappable thing a 44px target and tints from the craft tokens', () => {
    for (const selector of [
      '.corner-tab',
      '.corner-tool-button',
      '.corner-check',
      '.corner-faq-button',
      '.corner-fact-next',
    ]) {
      const rule = new RegExp(`${selector.replace('.', '\\.')}[^{]*\\{[^}]*min-height:\\s*44px`);
      expect(outside).toMatch(rule);
    }
    expect(outside).toMatch(/var\(--corner-tint\)/);
    expect(outside).toMatch(/var\(--corner-ink\)/);
  });
});
