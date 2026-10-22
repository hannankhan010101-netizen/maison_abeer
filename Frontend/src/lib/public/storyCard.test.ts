import { describe, expect, it } from 'vitest';

import { RESULT_COPY } from './quiz';
import { STORY_BOX, storyFilename, storyLayout, storyModel, type StoryModel } from './storyCard';

const ROUGH = (text: string, size: number) => text.length * size * 0.55;

function base(overrides: Partial<Parameters<typeof storyModel>[0]> = {}): StoryModel {
  return storyModel({
    kind: 'pottery',
    ...RESULT_COPY.pottery,
    handle: 'maisonabeer',
    ...overrides,
  });
}

function values(model: StoryModel): unknown[] {
  return Object.values(model);
}

describe('storyModel', () => {
  it('builds every field from the input, with the handle for display', () => {
    const model = base();
    expect(model).toEqual({
      kind: 'pottery',
      craft: 'Pottery',
      kicker: 'which workshop are you?',
      vibe: RESULT_COPY.pottery.vibe,
      line: RESULT_COPY.pottery.line,
      handle: '@maisonabeer',
    });
  });

  it('never carries undefined, a token, a URL or a CSS variable', () => {
    for (const kind of ['cake', 'pottery', 'painting'] as const) {
      for (const handle of [
        'maisonabeer',
        'https://instagram.com/maisonabeer',
        null,
        'bad handle!',
      ]) {
        const model = storyModel({ kind, ...RESULT_COPY[kind], handle });
        for (const value of values(model)) {
          expect(value).not.toBeUndefined();
          if (typeof value === 'string') {
            expect(value).not.toMatch(/undefined|null|https?:|var\(|--|token/i);
          }
        }
      }
    }
  });

  it('drops an invalid or missing handle to null', () => {
    expect(base({ handle: null }).handle).toBeNull();
    expect(base({ handle: 'not a handle' }).handle).toBeNull();
  });

  it('names the file for the craft', () => {
    expect(storyFilename('cake')).toBe('maison-cake-vibe.png');
    expect(storyFilename('painting')).toBe('maison-painting-vibe.png');
  });
});

describe('storyLayout', () => {
  function inside(model: StoryModel, measure = ROUGH) {
    const layout = storyLayout(model, measure);
    for (const block of layout.blocks) {
      expect(block.lines.length).toBeGreaterThan(0);
      expect(block.x - block.maxWidth / 2).toBeGreaterThanOrEqual(STORY_BOX.x);
      expect(block.x + block.maxWidth / 2).toBeLessThanOrEqual(STORY_BOX.x + STORY_BOX.width);
      const last = block.y + (block.lines.length - 1) * block.lineHeight;
      expect(block.y - block.size).toBeGreaterThanOrEqual(STORY_BOX.y);
      expect(last).toBeLessThanOrEqual(STORY_BOX.y + STORY_BOX.height);
      for (const line of block.lines) {
        expect(measure(line, block.size)).toBeLessThanOrEqual(block.maxWidth);
      }
    }
    expect(layout.mark.cy - layout.mark.r).toBeGreaterThanOrEqual(STORY_BOX.y);
    return layout;
  }

  it('keeps every block inside the card for each craft', () => {
    for (const kind of ['cake', 'pottery', 'painting'] as const) {
      inside(storyModel({ kind, ...RESULT_COPY[kind], handle: 'maisonabeer' }));
    }
  });

  it('blocks do not overlap and run top to bottom', () => {
    const { blocks } = inside(base());
    for (let i = 1; i < blocks.length; i += 1) {
      const above = blocks[i - 1]!;
      const end = above.y + (above.lines.length - 1) * above.lineHeight;
      expect(blocks[i]!.y - blocks[i]!.size).toBeGreaterThan(end);
    }
  });

  it('wraps a long vibe and cuts it with an ellipsis', () => {
    const vibe = 'A wonderfully long and winding vibe line '.repeat(6).trim();
    const layout = inside(base({ vibe }));
    const block = layout.blocks.find((b) => b.role === 'vibe')!;
    expect(block.lines.length).toBeGreaterThan(1);
    expect(block.lines.at(-1)).toMatch(/…$/);
  });

  it('fits a thirty character handle by shrinking it', () => {
    const handle = 'a'.repeat(30);
    const layout = inside(base({ handle }));
    const block = layout.blocks.find((b) => b.role === 'handle')!;
    expect(block.lines).toEqual([`@${handle}`]);
  });

  it('cuts a handle with an ellipsis when even the smallest size is too wide', () => {
    const wide = (text: string, size: number) => text.length * size * 1.2;
    const layout = inside(base({ handle: 'a'.repeat(30) }), wide);
    const block = layout.blocks.find((b) => b.role === 'handle')!;
    expect(block.lines).toHaveLength(1);
    expect(block.lines[0]).toMatch(/…$/);
  });

  it('has no handle line without a handle', () => {
    const layout = inside(base({ handle: null }));
    expect(layout.blocks.map((b) => b.role)).not.toContain('handle');
    expect(layout.blocks.flatMap((b) => b.lines).join(' ')).not.toMatch(/@/);
  });
});
