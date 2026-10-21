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

/**
 * How far the pinned section scrolls past its own top before it lets go: one
 * more viewport, so the whole story takes two screens of scroll, not three.
 */
export const PIN_DISTANCE = '+=100%';

/**
 * One outlined hand in the sticker style, fingers pointing along +x with the
 * fingertip at the origin: the back of the hand, the rounded fingertips, the
 * underside to the thumb, the thumb, the wrist; then one crease between the
 * fingers. Every hand in every stage is this list of points moved, so the
 * command shape never changes and a hand can morph from one stage to the next.
 */
const HAND: readonly (readonly [string, readonly number[]])[] = [
  ['M', [-46, -12]],
  ['C', [-32, -18, -14, -16, -2, -8]],
  ['C', [3, -5, 3, 4, -2, 6]],
  ['C', [-10, 9, -16, 8, -20, 10]],
  ['C', [-16, 16, -24, 22, -32, 16]],
  ['C', [-36, 14, -40, 14, -46, 14]],
  ['M', [-20, -3]],
  ['C', [-13, -3, -8, -2, -4, -1]],
];

/**
 * The left hand with its fingertip at (x, y), turned by `degrees` (negative
 * tips the fingers up), and the right hand as its mirror across the wheel.
 */
function hands(x: number, y: number, degrees: number): { left: string; right: string } {
  const a = (degrees * Math.PI) / 180;
  const n = (value: number) => Math.round(value * 10) / 10;
  const draw = (mirror: boolean) =>
    HAND.map(([command, values]) => {
      const points: string[] = [];
      for (let i = 0; i < values.length; i += 2) {
        const px = values[i]!;
        const py = values[i + 1]!;
        const rx = x + px * Math.cos(a) - py * Math.sin(a);
        const ry = y + px * Math.sin(a) + py * Math.cos(a);
        points.push(`${n(mirror ? 200 - rx : rx)} ${n(ry)}`);
      }
      return `${command}${points.join(' ')}`;
    }).join(' ');
  return { left: draw(false), right: draw(true) };
}

export const MAKING_STAGES = [
  {
    id: 'lump',
    caption: 'A lump of clay',
    // The hands wait just out of reach; they approach as the clay is centred.
    hands: { ...hands(22, 168, 0), opacity: 0 },
    path: 'M66 208 C50 202 40 190 42 176 C44 154 58 130 74 118 C92 106 108 106 126 118 C142 130 156 154 158 176 C160 190 150 202 134 208 C112 214 88 214 66 208 Z',
  },
  {
    id: 'centred',
    caption: 'Centred on the wheel',
    // Flat against the sides, holding it true.
    hands: { ...hands(59, 168, 0), opacity: 1 },
    path: 'M60 210 C60 190 60 175 60 160 C60 135 60 110 60 92 C86 86 114 86 140 92 C140 110 140 135 140 160 C140 175 140 190 140 210 C113 216 87 216 60 210 Z',
  },
  {
    id: 'opened',
    caption: 'Opened up',
    // Low and tipped up, cupping the bowl.
    hands: { ...hands(43, 168, -22), opacity: 1 },
    path: 'M64 210 C54 200 44 178 42 150 C40 124 42 106 46 90 C80 80 120 80 154 90 C158 106 160 124 158 150 C156 178 146 200 136 210 C112 216 88 216 64 210 Z',
  },
  {
    id: 'pulled',
    caption: 'Pulled into shape',
    // High on the neck, drawing the wall upward.
    hands: { ...hands(80, 92, -38), opacity: 1 },
    path: 'M72 210 C56 200 42 176 44 150 C46 120 80 84 82 34 C96 30 104 30 118 34 C120 84 154 120 156 150 C158 176 144 200 128 210 C108 216 92 216 72 210 Z',
  },
] as const satisfies readonly {
  id: 'lump' | 'centred' | 'opened' | 'pulled';
  caption: string;
  /** Outlined hands (cocoa stroke, no fill); hidden on the lump, on the clay after. */
  hands: { left: string; right: string; opacity: 0 | 1 };
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
