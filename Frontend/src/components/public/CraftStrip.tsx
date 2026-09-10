'use client';

import { cn } from '@/lib/cn';
import type { PublicClass } from '@/lib/public/api';

/**
 * "What we make here" — one bold, colour-blocked card per craft the studio
 * actually teaches, derived from the real classes on offer rather than a
 * hardcoded three. A studio that only runs pottery shouldn't advertise cake
 * decorating just because this app's default palette has a slot for it.
 *
 * This exists because there is no photograph anywhere in this app to answer
 * "show what we are" with — so each card answers it with the thing the app
 * already has plenty of: the craft's own brand colour, at full saturation
 * (not the pastel tint used elsewhere), a hand-drawn motif standing in for a
 * photo, and the craft's own name in display type.
 */

interface Craft {
  token: string;
  name: string;
}

/** One card per distinct colour token, first-seen order — not alphabetised,
 * so the studio's own scheduling emphasis (what they lead with) carries
 * through rather than being flattened into a fixed list. */
function craftsFrom(classes: PublicClass[]): Craft[] {
  const seen = new Map<string, Craft>();

  for (const item of classes) {
    if (!seen.has(item.color_token)) {
      seen.set(item.color_token, { token: item.color_token, name: item.name });
    }
  }

  return [...seen.values()];
}

const BLOCK: Record<string, { bg: string; ink: string }> = {
  pink: { bg: 'bg-pink', ink: 'text-on-pink' },
  terra: { bg: 'bg-terra', ink: 'text-buttercream' },
  sage: { bg: 'bg-sage', ink: 'text-cocoa' },
  butter: { bg: 'bg-butter', ink: 'text-cocoa' },
  rose: { bg: 'bg-rose', ink: 'text-on-rose' },
};

function blockFor(token: string) {
  return BLOCK[token] ?? BLOCK.pink!;
}

export function CraftStrip({ classes }: { classes: PublicClass[] }) {
  const crafts = craftsFrom(classes);
  if (crafts.length === 0) return null;

  return (
    <section aria-label="What we make here" className="py-2">
      <h2 className="font-display px-4 text-xl sm:px-6">What we make here</h2>

      {/* overflow-x-auto + snap: the natural swipe-to-browse gesture on a
          phone, rather than a grid that has to wrap and shrink. */}
      <ul className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:px-6 [&::-webkit-scrollbar]:hidden">
        {crafts.map((craft, index) => {
          const block = blockFor(craft.token);

          return (
            <li
              key={craft.token}
              className="animate-rise-in w-[72vw] max-w-[260px] shrink-0 snap-start sm:w-[220px]"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div
                className={cn(
                  'relative flex h-[168px] flex-col justify-between overflow-hidden rounded-[var(--radius-lg)] p-4',
                  block.bg,
                  block.ink,
                )}
              >
                <CraftMotif token={craft.token} />
                <span className="font-display relative z-10 text-2xl leading-tight">{craft.name}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * A hand-drawn stand-in for a photo: one loose motif per craft, rendered as
 * a large, mostly-transparent SVG watermark inside the block. Deliberately
 * imprecise/sketchy rather than a literal icon — it reads as "made by
 * hand," which is the studio's actual selling point.
 */
function CraftMotif({ token }: { token: string }) {
  const common = {
    'aria-hidden': true,
    className: 'absolute -top-3 -right-3 size-28 opacity-25',
    viewBox: '0 0 100 100',
    fill: 'none',
  } as const;

  if (token === 'terra') {
    // A thrown pot's silhouette — the widening curve of a wheel-thrown form.
    return (
      <svg {...common}>
        <path
          d="M35 10c-4 8-4 14 2 18-10 4-16 14-14 26 2 14 14 24 27 24s25-10 27-24c2-12-4-22-14-26 6-4 6-10 2-18"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (token === 'sage') {
    // A cluster of loose paint daubs.
    return (
      <svg {...common}>
        <circle cx="30" cy="35" r="14" fill="currentColor" />
        <circle cx="62" cy="24" r="9" fill="currentColor" />
        <circle cx="70" cy="55" r="16" fill="currentColor" />
        <circle cx="38" cy="68" r="8" fill="currentColor" />
      </svg>
    );
  }

  // Default (pink/rose/butter) — a piped-icing squiggle.
  return (
    <svg {...common}>
      <path
        d="M8 60c8-22 18-30 26-22s2 24 14 24 10-30 24-30 14 22 24 14"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
