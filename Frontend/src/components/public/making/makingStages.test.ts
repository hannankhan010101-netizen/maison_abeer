import { describe, expect, it } from 'vitest';

import { MAKING_STAGES, stageForProgress } from './makingStages';

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
});
