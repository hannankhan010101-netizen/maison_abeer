'use client';

import { cn } from '@/lib/cn';
import type { PublicClass } from '@/lib/public/api';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';

/**
 * "What we make here" — one card per craft the studio actually teaches,
 * derived from the real classes on offer rather than a hardcoded three. A
 * studio that only runs pottery shouldn't advertise cake decorating just
 * because this app's default palette has a slot for it.
 *
 * A class type can now carry a real photo (Brand Kit → class photos, same
 * paste-a-link pattern as the studio's logo). When one's set, it's the
 * card's whole background. When it isn't — which is every studio until a
 * host adds one — the card falls back to the craft's own brand colour at
 * full saturation plus a hand-drawn motif standing in for a photo. Neither
 * state is a placeholder for the other; both are complete on their own.
 */

interface Craft {
  token: string;
  name: string;
  photoUrl: string | null;
}

/** One card per distinct colour token, first-seen order — not alphabetised,
 * so the studio's own scheduling emphasis (what they lead with) carries
 * through rather than being flattened into a fixed list. */
function craftsFrom(classes: PublicClass[]): Craft[] {
  const seen = new Map<string, Craft>();

  for (const item of classes) {
    if (!seen.has(item.color_token)) {
      seen.set(item.color_token, {
        token: item.color_token,
        name: item.name,
        photoUrl: item.photo_url,
      });
    }
  }

  return [...seen.values()];
}

/**
 * Fill/ink pairs for the no-photo card.
 *
 * Every ink here is an `on-*` token, never raw `--color-cocoa`. These five
 * fills are all in contrast.test.ts's `sharedByDesign` set — they identify a
 * craft, so they deliberately do not flip in mocha — while cocoa does flip, to
 * #F4E9DF. Pairing the two put the craft name at 1.66:1 on sage and 1.12:1 on
 * butter in dark mode (light mode was a comfortable 6.31:1 and 9.33:1, which
 * is why it survived a dev pass), missing even the 3:1 large-text bar the
 * 24px name would be allowed by a factor of two to three. This table is an
 * in-component colour map, parallel to src/lib/tags/themes.ts, and like it is
 * outside contrast.test.ts's PAIRS list — hence the tokens.
 */
const BLOCK: Record<string, { bg: string; ink: string }> = {
  pink: { bg: 'bg-pink', ink: 'text-on-pink' },
  terra: { bg: 'bg-terra', ink: 'text-photo-ink' },
  sage: { bg: 'bg-sage', ink: 'text-on-sage' },
  butter: { bg: 'bg-butter', ink: 'text-on-butter' },
  rose: { bg: 'bg-rose', ink: 'text-on-rose' },
};

function blockFor(token: string) {
  return BLOCK[token] ?? BLOCK.pink!;
}

export function CraftStrip({ classes }: { classes: PublicClass[] }) {
  const crafts = craftsFrom(classes);
  const [ref, visible] = useRevealOnScroll<HTMLUListElement>();
  if (crafts.length === 0) return null;

  return (
    <section aria-label="What we make here" className="py-2">
      <h2 className="font-display px-4 text-xl sm:px-6">What we make here</h2>

      {/* overflow-x-auto + snap: the natural swipe-to-browse gesture on a
          phone, rather than a grid that has to wrap and shrink. Cards reveal
          only once this strip has actually scrolled into view, so the
          stagger plays out in front of the guest instead of finishing
          before they ever see it. */}
      <ul
        ref={ref}
        className="mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pt-2 pb-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {crafts.map((craft, index) => {
          const block = blockFor(craft.token);

          return (
            <li
              key={craft.token}
              className={cn(
                'w-[72vw] max-w-[260px] shrink-0 snap-start sm:w-[220px]',
                visible && 'animate-rise-in',
              )}
              style={visible ? { animationDelay: `${index * 80}ms` } : { opacity: 0 }}
            >
              <div
                data-cursor-label="EXPLORE"
                className={cn(
                  'group relative flex h-[168px] flex-col justify-between overflow-hidden rounded-[var(--radius-lg)] p-4',
                  'shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-200',
                  'hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] active:scale-[0.98]',
                  'motion-reduce:transform-none motion-reduce:transition-none',
                  craft.photoUrl ? 'text-photo-ink' : cn(block.bg, block.ink),
                )}
              >
                {craft.photoUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={craft.photoUrl}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="absolute inset-0 size-full scale-100 object-cover transition-transform duration-500 group-hover:scale-110 group-active:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                    {/* Scrim stops are in px, not %, because what has to be
                        covered is the text band — two 30px lines of
                        text-2xl/leading-tight plus p-4, i.e. the bottom 76px
                        of the tile — not a fraction of the tile. The old
                        `from-black/65 via-black/10 to-transparent` put its
                        dense end at the tile's bottom EDGE and was already
                        spent by the time it reached a glyph: measured over a
                        white photo (the worst case a lit-workshop shot
                        approaches), photo-ink ran 4.25:1 at a one-line
                        name's baseline band and 2.21:1 at its cap height,
                        and a two-line name's first line sat at 1.33:1 —
                        `craft.name` is a host-authored class name in a 72vw
                        tile, so two lines is ordinary, not an edge case. The
                        6.34:1 the old gradient could be quoted for was the
                        pixel row below the text, which nothing is drawn on.
                        black/58 at 78px composites to #6B6B6B, 4.84:1, and
                        that is the worst point anywhere in the clamped glyph
                        band (6.99:1 at the first baseline, 7.68:1 at the
                        tile floor) — AA body text, not merely the 3:1 bar a
                        24px name would be allowed, so the guarantee survives
                        the name being made smaller later. Above the band it
                        fades to nothing over the remaining 90px rather than
                        holding black/55 to three-quarters height: the photo
                        is this card's whole background (see the docstring),
                        so the scrim covers the ink and no more. */}
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[linear-gradient(to_top,rgb(0_0_0/0.70)_0px,rgb(0_0_0/0.58)_78px,transparent_168px)]"
                    />
                  </>
                ) : (
                  <CraftMotif token={craft.token} />
                )}
                {/* line-clamp-2 is what makes the scrim's 78px stop a
                    guarantee rather than an average: a three- or four-line
                    class name would push its first line above the covered
                    band (and a four-line name overflows the fixed h-[168px]
                    tile anyway, getting clipped mid-glyph by
                    overflow-hidden). */}
                <span className="font-display relative z-10 mt-auto line-clamp-2 text-2xl leading-tight">
                  {craft.name}
                </span>
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
