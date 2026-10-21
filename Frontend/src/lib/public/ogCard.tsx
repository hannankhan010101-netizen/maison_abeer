import type { ReactNode } from 'react';

import type { CraftKind } from './studioPhotos';

/**
 * The 1200×630 card a booking link unfurls into.
 *
 * Rendered by `next/og` (Satori), which has no CSS variables, no Tailwind and
 * no stylesheet: every colour below is a literal copy of a token in
 * `tokens.css` (light theme), and every element with more than one child sets
 * `display: flex`, which Satori requires. The sticker shapes are copied from
 * `components/public/CraftStickers.tsx` rather than imported, because those
 * read `var(--color-…)`.
 *
 * Pure and synchronous so it can be unit-tested with `renderToStaticMarkup`.
 */

const C = {
  buttercream: '#fff8f0',
  paper: '#fffdfa',
  dot: '#ecdccb',
  cocoa: '#40302a',
  blush: '#fbe7ea',
  pink: '#f2aabe',
  rose: '#e2849e',
  roseDeep: '#c25b78',
  terra: '#c96f4a',
  terraSoft: '#f3dccb',
  terraDeep: '#9b4d2d',
  sage: '#adbe93',
  sageInk: '#5f714d',
  butter: '#f7dc94',
} as const;

const INK = {
  stroke: C.cocoa,
  strokeWidth: 2.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Sticker({ craft, children }: { craft: CraftKind; children: ReactNode }) {
  return (
    <svg data-sticker={craft} width="132" height="132" viewBox="0 0 100 100">
      {children}
    </svg>
  );
}

function Pot() {
  return (
    <Sticker craft="pottery">
      <ellipse cx="50" cy="86" rx="30" ry="7" fill={C.terraSoft} {...INK} />
      <path
        d="M37 24c-3 6-3 11 2 14-10 5-16 15-13 27 3 13 13 21 24 21s21-8 24-21c3-12-3-22-13-27 5-3 5-8 2-14Z"
        fill={C.terra}
        {...INK}
      />
      <ellipse cx="50" cy="24" rx="13" ry="4.5" fill={C.terraSoft} {...INK} />
      <path
        d="M31 56c12 5 26 5 38 0M33 67c11 4 23 4 34 0"
        fill="none"
        stroke={C.terraDeep}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </Sticker>
  );
}

function Cake() {
  return (
    <Sticker craft="cake">
      <ellipse cx="50" cy="80" rx="34" ry="8" fill={C.paper} {...INK} />
      <path d="M22 50v22c0 5 12 9 28 9s28-4 28-9V50" fill={C.blush} {...INK} />
      <ellipse cx="50" cy="50" rx="28" ry="10" fill={C.pink} {...INK} />
      <path
        d="M26 55c0 7 3 9 5 9s4-3 4-7M40 59c0 8 3 10 5 10s4-3 4-8M58 58c0 8 3 10 5 10s4-3 4-8"
        fill="none"
        stroke={C.rose}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M52 42c1-7 4-11 10-13" fill="none" {...INK} />
      <circle cx="51" cy="43" r="6" fill={C.roseDeep} {...INK} />
    </Sticker>
  );
}

function Palette() {
  return (
    <Sticker craft="painting">
      <path
        d="M46 14c24 0 40 15 40 32 0 10-8 14-16 13-8-1-12 4-9 11 3 7-3 16-15 16C25 86 10 70 10 50S24 14 46 14Z"
        fill={C.paper}
        {...INK}
      />
      <circle cx="30" cy="38" r="6.5" fill={C.pink} />
      <circle cx="47" cy="29" r="6.5" fill={C.sage} />
      <circle cx="65" cy="36" r="6.5" fill={C.butter} />
      <circle cx="27" cy="58" r="6.5" fill={C.terra} />
      <path d="M58 92L84 46" stroke={C.cocoa} strokeWidth="6" strokeLinecap="round" />
      <path d="M82 48l5-14 6 10-7 8Z" fill={C.rose} {...INK} />
    </Sticker>
  );
}

const STICKER: Record<CraftKind, () => ReactNode> = {
  pottery: Pot,
  cake: Cake,
  painting: Palette,
};

/** "maison-abeer" → "Maison Abeer": the card's name when the API is unreachable. */
export function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function OgCard({
  name,
  crafts,
  seats,
}: {
  name: string;
  crafts: CraftKind[];
  seats: string | null;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '72px 88px',
        backgroundColor: C.buttercream,
        backgroundImage: `radial-gradient(circle at 2px 2px, ${C.dot} 2px, transparent 0)`,
        backgroundSize: '28px 28px',
        color: C.cocoa,
        fontFamily: 'Fraunces, serif',
      }}
    >
      {crafts.length > 0 ? (
        <div style={{ display: 'flex', gap: 20, marginBottom: 36 }}>
          {crafts.map((craft) => {
            const Shape = STICKER[craft];
            return <Shape key={craft} />;
          })}
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          fontSize: name.length > 24 ? 72 : 96,
          fontWeight: 600,
          lineHeight: 1.05,
          letterSpacing: '-0.01em',
        }}
      >
        {name}
      </div>
      {seats ? (
        <div
          data-seats=""
          style={{ display: 'flex', marginTop: 28, fontSize: 36, color: C.terraDeep }}
        >
          {seats}
        </div>
      ) : null}
    </div>
  );
}
