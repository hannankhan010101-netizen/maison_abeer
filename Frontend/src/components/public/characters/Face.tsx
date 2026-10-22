import type { ReactNode } from 'react';

import type { CharacterMood } from './cast';

/**
 * The sticker face every character shares: two dot eyes, a smile and two
 * blush cheeks, centred on (`x`, `y`) in the 64-unit viewBox. Each mood moves
 * only the eyes and the mouth, so the cast reads as one family.
 */
export function Face({
  mood,
  x,
  y,
  ink,
}: {
  mood: CharacterMood;
  x: number;
  y: number;
  ink: string;
}) {
  const left = x - 8;
  const right = x + 8;
  const closed = (cx: number): ReactNode => <path d={`M${cx - 3} ${y - 1} q3 3 6 0`} fill="none" />;

  const eyes: ReactNode =
    mood === 'sleepy' ? (
      <>
        {closed(left)}
        {closed(right)}
      </>
    ) : mood === 'wink' ? (
      <>
        <circle cx={left} cy={y - 1} r={2.4} stroke="none" style={{ fill: ink }} />
        <path d={`M${right - 3} ${y} l3 -2.5 l3 2.5`} fill="none" />
      </>
    ) : (
      <>
        <circle
          cx={left}
          cy={y - 1}
          r={mood === 'wow' ? 3 : 2.4}
          stroke="none"
          style={{ fill: ink }}
        />
        <circle
          cx={right}
          cy={y - 1}
          r={mood === 'wow' ? 3 : 2.4}
          stroke="none"
          style={{ fill: ink }}
        />
      </>
    );

  const mouth: ReactNode =
    mood === 'wow' ? (
      <ellipse cx={x} cy={y + 6} rx={2.6} ry={3.2} style={{ fill: ink }} stroke="none" />
    ) : mood === 'sleepy' ? (
      <path d={`M${x - 2.5} ${y + 6} h5`} fill="none" />
    ) : (
      <path d={`M${x - 4} ${y + 4.5} q4 4 8 0`} fill="none" />
    );

  return (
    <g
      data-part="face"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ stroke: ink }}
    >
      <g data-part="eyes">{eyes}</g>
      <g data-part="mouth">{mouth}</g>
      <ellipse
        cx={left - 3}
        cy={y + 4}
        rx={2.6}
        ry={1.6}
        stroke="none"
        opacity={0.35}
        style={{ fill: 'var(--color-rose)' }}
      />
      <ellipse
        cx={right + 3}
        cy={y + 4}
        rx={2.6}
        ry={1.6}
        stroke="none"
        opacity={0.35}
        style={{ fill: 'var(--color-rose)' }}
      />
    </g>
  );
}

/** The fixed frame every character is drawn in. */
export function CharacterSvg({
  mood,
  size,
  children,
}: {
  mood: CharacterMood;
  size: number;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      data-mood={mood}
      className="character-svg"
    >
      {children}
    </svg>
  );
}

/** The default drawn size, in CSS pixels. */
export const CHARACTER_SIZE = 56;
