import { describe, expect, it } from 'vitest';

import {
  MAKING_STAGES,
  PIN_DISTANCE,
  RIM_OPENED,
  RIM_PULLED,
  stageForProgress,
} from './makingStages';

describe('stageForProgress', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [0.25, 1],
    [0.4999, 1],
    [0.5, 2],
    [0.75, 3],
    [1, 3],
    [2, 3],
    [Number.NaN, 0],
  ])('%s -> stage %s', (progress, stage) => {
    expect(stageForProgress(progress)).toBe(stage);
  });
});

describe('MAKING_STAGES', () => {
  it('has the four captions, in order', () => {
    expect(MAKING_STAGES.map((s) => s.caption)).toEqual([
      'A lump of clay',
      'Centred on the wheel',
      'Opened up',
      'Pulled into shape',
    ]);
    expect(MAKING_STAGES.map((s) => s.id)).toEqual(['lump', 'centred', 'opened', 'pulled']);
  });

  it('draws every path with the same commands, so they morph cleanly', () => {
    const commands = (d: string) => d.replace(/[^A-Za-z]/g, '');
    expect(new Set(MAKING_STAGES.map((s) => commands(s.path))).size).toBe(1);
    expect(commands(MAKING_STAGES[0].path)).toBe('MCCCCCCZ');
  });

  it('draws the two rims with one command shape, so the rim can morph from bowl to vase', () => {
    const commands = (d: string) => d.replace(/[^A-Za-z]/g, '');
    expect(commands(RIM_OPENED)).toBe('MCCCCZ');
    expect(commands(RIM_PULLED)).toBe(commands(RIM_OPENED));
  });
});

describe('the hands', () => {
  it('gives every stage a left and a right hand drawn as path data', () => {
    for (const stage of MAKING_STAGES) {
      expect(stage.hands.left, stage.id).toMatch(/^M/);
      expect(stage.hands.right, stage.id).toMatch(/^M/);
    }
  });

  it('keeps the hands away from the lump and on the clay from centring onwards', () => {
    expect(MAKING_STAGES.map((s) => s.hands.opacity)).toEqual([0, 1, 1, 1]);
  });

  it('draws each hand with one command shape across the stages, so the hands can morph too', () => {
    const commands = (d: string) => d.replace(/[^A-Za-z]/g, '');
    expect(new Set(MAKING_STAGES.map((s) => commands(s.hands.left))).size).toBe(1);
    expect(new Set(MAKING_STAGES.map((s) => commands(s.hands.right))).size).toBe(1);
  });
});

describe('PIN_DISTANCE', () => {
  it('pins for one extra viewport, so the story takes two screens of scroll', () => {
    expect(PIN_DISTANCE).toBe('+=100%');
  });
});
