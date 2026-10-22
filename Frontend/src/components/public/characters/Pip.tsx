import type { CharacterProps } from './cast';
import { CHARACTER_SIZE, CharacterSvg, Face } from './Face';

const TINT = 'var(--craft-pottery)';
const INK = 'var(--craft-pottery-ink)';

/** Pip, a soft blob of clay with a pinched-up top, for pottery. */
export function Pip({ mood = 'happy', size = CHARACTER_SIZE }: CharacterProps) {
  return (
    <CharacterSvg mood={mood} size={size}>
      <g strokeWidth={2.5} strokeLinejoin="round" style={{ stroke: INK }}>
        <path
          d="M32 12c-2-4 1-7 4-6-1 2 0 4 1 6 11 1 19 11 18 24-1 13-10 20-23 20S9 49 9 36c0-12 9-22 23-24z"
          style={{ fill: TINT }}
        />
        <path d="M17 44c4 5 9 7 15 7" fill="none" strokeLinecap="round" opacity={0.4} />
      </g>
      <Face mood={mood} x={32} y={34} ink={INK} />
    </CharacterSvg>
  );
}
