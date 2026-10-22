import type { CharacterProps } from './cast';
import { CHARACTER_SIZE, CharacterSvg, Face } from './Face';

const TINT = 'var(--craft-painting)';
const INK = 'var(--craft-painting-ink)';

/** Dot, a paint palette with a thumb hole and three blobs of colour. */
export function Dot({ mood = 'happy', size = CHARACTER_SIZE }: CharacterProps) {
  return (
    <CharacterSvg mood={mood} size={size}>
      <g strokeWidth={2.5} strokeLinejoin="round" style={{ stroke: INK }}>
        <path
          d="M33 9c13 0 23 9 23 21 0 7-5 10-10 9-4-1-7 2-5 6 2 5-2 10-9 10C18 55 8 45 8 32S19 9 33 9z"
          style={{ fill: TINT }}
        />
        <circle cx={46} cy={30} r={3} style={{ fill: 'var(--color-paper)' }} />
      </g>
      <g stroke="none">
        <circle cx={22} cy={18} r={3.5} style={{ fill: 'var(--craft-bento-ink)' }} />
        <circle cx={33} cy={15} r={3.5} style={{ fill: 'var(--craft-pottery-ink)' }} />
        <circle cx={44} cy={19} r={3.5} style={{ fill: 'var(--color-sage)' }} />
      </g>
      <Face mood={mood} x={27} y={34} ink={INK} />
    </CharacterSvg>
  );
}
