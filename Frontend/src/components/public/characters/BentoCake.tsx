import type { CharacterProps } from './cast';
import { CHARACTER_SIZE, CharacterSvg, Face } from './Face';

const TINT = 'var(--craft-bento)';
const INK = 'var(--craft-bento-ink)';

/** Bento, a little lunchbox cake with a drip of frosting and a cherry. */
export function BentoCake({ mood = 'happy', size = CHARACTER_SIZE }: CharacterProps) {
  return (
    <CharacterSvg mood={mood} size={size}>
      <g strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: INK }}>
        <rect x={9} y={22} width={46} height={34} rx={10} style={{ fill: TINT }} />
        <path
          d="M9 32c0-6 4-10 10-10h26c6 0 10 4 10 10-3 0-3 4-6 4s-3-5-6-5-3 6-6 6-3-6-6-6-3 5-6 5-3-4-6-4-3 4-6 4z"
          style={{ fill: 'var(--color-paper)' }}
        />
        <path d="M32 21c0-4 2-7 5-8" fill="none" />
        <circle cx={32} cy={17} r={4} style={{ fill: INK }} />
      </g>
      <Face mood={mood} x={32} y={44} ink={INK} />
    </CharacterSvg>
  );
}
