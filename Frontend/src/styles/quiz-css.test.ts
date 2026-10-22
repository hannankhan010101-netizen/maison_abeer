import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The quiz is static and complete by default. Its step fade exists only for a
 * guest who has not asked for less motion, behind `.is-animated` (motion tier
 * one or more), and animates only transform and opacity. Every tap target is
 * at least 44px.
 */

const css = readFileSync(join(__dirname, 'units', 'quiz.css'), 'utf8');

function motionBlocks(source: string): Array<{ start: number; end: number; body: string }> {
  const blocks: Array<{ start: number; end: number; body: string }> = [];
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

describe('quiz.css', () => {
  const blocks = motionBlocks(css);
  const inside = blocks.map((block) => block.body).join('\n');
  const outside = blocks.reduceRight(
    (source, block) => source.slice(0, block.start) + source.slice(block.end),
    css,
  );

  it('animates the steps only under no-preference and .is-animated', () => {
    expect(inside).toMatch(/\.quiz\.is-animated[^{]*\{[^}]*animation/);
    expect(outside).not.toMatch(/animation|transition/);
  });

  it('animates only transform and opacity', () => {
    for (const frames of inside.match(/@keyframes[^{]*\{[\s\S]*?\}\s*\}/g) ?? []) {
      const properties = [...frames.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]);
      for (const property of properties) expect(['transform', 'opacity']).toContain(property);
    }
    const transitions = [...inside.matchAll(/transition(?:-property)?\s*:\s*([^;]+);/g)];
    for (const [, value] of transitions) expect(value).toMatch(/^(transform|opacity)/);
  });

  it('gives every button a 44px target', () => {
    for (const selector of [
      '.quiz-answer',
      '.quiz-back',
      '.quiz-book',
      '.quiz-share',
      '.quiz-restart',
    ]) {
      const rule = new RegExp(
        `${selector.replace('.', '\\.')}[^{]*\\{[^}]*min-height:\\s*(\\d+)px`,
      );
      const match = rule.exec(css);
      expect(match, selector).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThanOrEqual(44);
    }
  });

  it('uses the craft tint pair through the quiz variables', () => {
    expect(css).toMatch(/var\(--quiz-tint/);
    expect(css).toMatch(/var\(--quiz-ink/);
  });
});
