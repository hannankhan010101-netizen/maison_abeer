/**
 * The four stages of throwing a pot, as silhouettes in one shared box.
 *
 * Every path has exactly the same shape of data — a start point, six cubic
 * curves, close — because MorphSVG pairs points up in order: matching counts
 * are what let a lump grow into a vase without folding over itself. Each one
 * walks clockwise from the bottom-left corner: up the left side, across the
 * top, down the right side, back along the base.
 */

export const MAKING_VIEWBOX = '0 0 200 240';

export const MAKING_STAGES = [
  {
    id: 'lump',
    caption: 'A lump of clay',
    path: 'M70 206 C54 196 44 182 46 165 C48 145 56 126 70 118 C92 108 108 108 130 118 C144 126 152 145 154 165 C156 182 146 196 130 206 C110 212 90 212 70 206 Z',
  },
  {
    id: 'centred',
    caption: 'Centred on the wheel',
    path: 'M60 210 C60 190 60 175 60 160 C60 135 60 110 60 92 C86 86 114 86 140 92 C140 110 140 135 140 160 C140 175 140 190 140 210 C113 216 87 216 60 210 Z',
  },
  {
    id: 'opened',
    caption: 'Opened up',
    path: 'M64 210 C54 200 44 178 42 150 C40 124 42 106 46 90 C80 100 120 100 154 90 C158 106 160 124 158 150 C156 178 146 200 136 210 C112 216 88 216 64 210 Z',
  },
  {
    id: 'pulled',
    caption: 'Pulled into shape',
    path: 'M72 210 C56 200 42 176 44 150 C46 120 80 84 82 34 C96 30 104 30 118 34 C120 84 154 120 156 150 C158 176 144 200 128 210 C108 216 92 216 72 210 Z',
  },
] as const satisfies readonly {
  id: 'lump' | 'centred' | 'opened' | 'pulled';
  caption: string;
  path: string;
}[];

/** Which stage a scroll position belongs to; anything unreadable is the first. */
export function stageForProgress(progress: number): 0 | 1 | 2 | 3 {
  if (Number.isNaN(progress)) return 0;
  const p = Math.min(1, Math.max(0, progress));
  if (p < 0.25) return 0;
  if (p < 0.5) return 1;
  if (p < 0.75) return 2;
  return 3;
}
