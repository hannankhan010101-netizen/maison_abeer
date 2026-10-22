import { guideFor } from './craftGuide';
import { displayHandle } from './instagram';
import type { CraftKind } from './studioPhotos';
import { wrapLines } from './ticket';

/**
 * The Story-size picture a guest can share after the quiz: what it says and
 * where each line sits. Pure and DOM-free, so every awkward case (a long vibe,
 * a thirty-character handle, no handle at all) is pinned by a unit test;
 * `storyCanvas.ts` only draws it.
 *
 * The model is built field by field. It carries the craft, the quiz's own copy
 * and the studio's handle for display, and nothing else: no URL, no price, no
 * studio fact.
 */

export interface StoryModel {
  kind: CraftKind;
  craft: string;
  kicker: string;
  vibe: string;
  line: string;
  /** `@handle`, or `null` when the studio has no valid handle (then no line is drawn). */
  handle: string | null;
}

export function storyModel(input: {
  kind: CraftKind;
  vibe: string;
  line: string;
  handle: string | null;
}): StoryModel {
  return {
    kind: input.kind,
    craft: guideFor(input.kind).title,
    kicker: 'which workshop are you?',
    vibe: input.vibe,
    line: input.line,
    handle: displayHandle(input.handle),
  };
}

export function storyFilename(kind: CraftKind): string {
  return `maison-${kind}-vibe.png`;
}

export const STORY_SIZE = { width: 1080, height: 1920 } as const;

/** The card on the picture; every word is drawn inside it. */
export const STORY_BOX = { x: 90, y: 200, width: 900, height: 1560 } as const;

export type StoryFace = 'display' | 'body' | 'hand';

export interface StoryBlock {
  role: 'kicker' | 'craft' | 'vibe' | 'line' | 'handle';
  face: StoryFace;
  weight: number;
  size: number;
  lineHeight: number;
  /** Centre of the text. */
  x: number;
  /** Baseline of the first line. */
  y: number;
  maxWidth: number;
  lines: string[];
}

export interface StoryLayout {
  mark: { cx: number; cy: number; r: number };
  blocks: StoryBlock[];
}

export type StoryMeasure = (text: string, size: number, face: StoryFace, weight: number) => number;

const CENTRE = STORY_SIZE.width / 2;
const TEXT_WIDTH = 780;
const HANDLE_SIZES = [72, 60, 48, 40] as const;
const HANDLE_MIN = 40;

function block(
  measure: StoryMeasure,
  spec: Omit<StoryBlock, 'lines' | 'x' | 'maxWidth'> & { text: string; maxLines: number },
): StoryBlock {
  const { text, maxLines, ...rest } = spec;
  const fit = (value: string) => measure(value, rest.size, rest.face, rest.weight);
  return {
    ...rest,
    x: CENTRE,
    maxWidth: TEXT_WIDTH,
    lines: wrapLines(fit, text, TEXT_WIDTH, maxLines),
  };
}

const end = (b: StoryBlock) => b.y + (b.lines.length - 1) * b.lineHeight;

export function storyLayout(model: StoryModel, measure: StoryMeasure): StoryLayout {
  const kicker = block(measure, {
    role: 'kicker',
    face: 'hand',
    weight: 700,
    size: 64,
    lineHeight: 72,
    y: 360,
    text: model.kicker,
    maxLines: 1,
  });
  const mark = { cx: CENTRE, cy: 600, r: 180 };
  const craft = block(measure, {
    role: 'craft',
    face: 'body',
    weight: 800,
    size: 44,
    lineHeight: 52,
    y: 880,
    text: model.craft.toUpperCase(),
    maxLines: 1,
  });
  const vibe = block(measure, {
    role: 'vibe',
    face: 'display',
    weight: 500,
    size: 96,
    lineHeight: 108,
    y: 1010,
    text: model.vibe,
    maxLines: 3,
  });
  const line = block(measure, {
    role: 'line',
    face: 'body',
    weight: 400,
    size: 46,
    lineHeight: 64,
    y: end(vibe) + 110,
    text: model.line,
    maxLines: 4,
  });
  const blocks = [kicker, craft, vibe, line];

  if (model.handle) {
    const handle = model.handle;
    // The biggest size the whole handle fits at; past the smallest, it is cut.
    const size =
      HANDLE_SIZES.find((candidate) => measure(handle, candidate, 'hand', 700) <= TEXT_WIDTH) ??
      HANDLE_MIN;
    blocks.push(
      block(measure, {
        role: 'handle',
        face: 'hand',
        weight: 700,
        size,
        lineHeight: size,
        y: 1660,
        // One unbreakable word, so a too-wide handle is cut rather than wrapped.
        text: handle.replace(/\s+/g, ''),
        maxLines: 1,
      }),
    );
  }

  return { mark, blocks };
}
