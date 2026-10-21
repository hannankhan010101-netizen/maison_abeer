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
    path: 'M66 208 C50 202 40 190 42 176 C44 154 58 130 74 118 C92 106 108 106 126 118 C142 130 156 154 158 176 C160 190 150 202 134 208 C112 214 88 214 66 208 Z',
  },
  {
    id: 'centred',
    caption: 'Centred on the wheel',
    path: 'M60 210 C60 190 60 175 60 160 C60 135 60 110 60 92 C86 86 114 86 140 92 C140 110 140 135 140 160 C140 175 140 190 140 210 C113 216 87 216 60 210 Z',
  },
  {
    id: 'opened',
    caption: 'Opened up',
    path: 'M64 210 C54 200 44 178 42 150 C40 124 42 106 46 90 C80 80 120 80 154 90 C158 106 160 124 158 150 C156 178 146 200 136 210 C112 216 88 216 64 210 Z',
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

/** An ellipse as four cubic curves, so two of them can morph into one another. */
function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  const k = 0.5523;
  const n = (value: number) => Math.round(value * 10) / 10;
  return [
    `M${n(cx - rx)} ${cy}`,
    `C${n(cx - rx)} ${n(cy - k * ry)} ${n(cx - k * rx)} ${n(cy - ry)} ${cx} ${n(cy - ry)}`,
    `C${n(cx + k * rx)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy - k * ry)} ${n(cx + rx)} ${cy}`,
    `C${n(cx + rx)} ${n(cy + k * ry)} ${n(cx + k * rx)} ${n(cy + ry)} ${cx} ${n(cy + ry)}`,
    `C${n(cx - k * rx)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + k * ry)} ${n(cx - rx)} ${cy}`,
    'Z',
  ].join(' ');
}

/**
 * The dark opening seen from slightly above, sitting exactly on the top edge of
 * the bowl and of the vase. It is a second morphing path, not a picture.
 */
export const RIM_OPENED = ellipse(100, 90, 54, 8);
export const RIM_PULLED = ellipse(100, 34, 18, 4);

/** Which stage a scroll position belongs to; anything unreadable is the first. */
export function stageForProgress(progress: number): 0 | 1 | 2 | 3 {
  if (Number.isNaN(progress)) return 0;
  const p = Math.min(1, Math.max(0, progress));
  if (p < 0.25) return 0;
  if (p < 0.5) return 1;
  if (p < 0.75) return 2;
  return 3;
}
