'use client';

import type { CSSProperties } from 'react';

import {
  StickerCake,
  StickerHeart,
  StickerPalette,
  StickerPot,
  StickerSpark,
} from '@/components/public/CraftStickers';
import { ParticleField } from '@/components/public/ParticleField';
import { PhotoFan } from '@/components/public/PhotoFan';
import { cn } from '@/lib/cn';
import type { PublicClass } from '@/lib/public/api';
import { nextClass, whenCopy } from '@/lib/public/format';
import { scrollToId } from '@/lib/public/lenisBridge';
import { useHeroParallax } from '@/lib/public/useHeroParallax';
import { useMagnetic } from '@/lib/public/useMagnetic';
import { useMayAnimate } from '@/lib/public/useMayAnimate';
import { useMountedNow } from '@/lib/public/useMountedNow';

/**
 * The booking page's hero — the studio's name as the actual hero, a handful
 * of hand-drawn craft stickers around it, and the studio's own brand colours
 * carried through when it has set any (Settings → Brand Kit).
 *
 * There is no photograph anywhere in this app — no logo file, no class
 * photos, nothing — and there never has been. Rather than fake that with
 * stock imagery, the hero leans on what the app already has and does well:
 * oversized display type, the three-typeface voice (serif / body /
 * handwritten), colour, and now the stickers (`CraftStickers`), which are
 * drawn in those same tokens.
 *
 * The stickers replaced a WebGL scene of floating polyhedra. Two reasons.
 * Abstract shapes read as "a tech landing page"; a frosted cake and a thrown
 * pot read as "this is where you make one", which is the whole pitch. And
 * `three` was the heaviest thing on the page by a wide margin, loaded for a
 * decoration — inline SVG weighs a few kilobytes and is on screen in the
 * first paint, which for a guest on mobile data from an ad is the better
 * kind of premium.
 *
 * The one piece of real information here is the ticket chip: the soonest
 * class and its seats, from the same payload the picker renders. No
 * "12 people are looking at this" — a number the guest can scroll down and
 * check is worth more than one they cannot.
 *
 * When a studio *has* added a real photo, the hero becomes a full-bleed
 * cinematic still rather than a UI panel laid over one: a slow ambient zoom
 * on the image, a few pixels of cursor-driven parallax on desktop, and a
 * scrim that dissolves all the way into the page's own background colour at
 * the bottom edge — so the hero doesn't end at a hard seam, it fades into
 * the section beneath it the way a page in a printed book turns.
 */

export interface BookingHeroProps {
  studioName: string;
  handle?: string | null;
  /** From the studio's own Brand Kit. Null falls back to the app's defaults. */
  primaryColor?: string | null;
  accentColor?: string | null;
  /** A real photo of the studio, when one's been added. Null keeps the
   * type-and-colour hero exactly as before — never a placeholder box. */
  heroPhotoUrl?: string | null;
  /** The classes on offer, for the "next class" ticket chip. */
  classes?: PublicClass[];
}

const FOCUS = 'focus-visible:outline-[3px] focus-visible:outline-offset-2';

export function BookingHero({
  studioName,
  handle,
  primaryColor,
  accentColor,
  heroPhotoUrl,
  classes = [],
}: BookingHeroProps) {
  const mayAnimate = useMayAnimate();
  const hasPhoto = Boolean(heroPhotoUrl);
  const parallaxRef = useHeroParallax<HTMLDivElement>();
  const ctaRef = useMagnetic<HTMLAnchorElement>();

  // The whole design system already routes colour through CSS custom
  // properties (see tokens.css and how `.mocha` retheming works the same
  // way) — so a studio's own brand colours are applied the identical way: an
  // inline override on the two properties every rose/pink utility already
  // reads from, scoped to this header. Every `bg-rose`, `text-rose-ink`,
  // `border-rose` etc. beneath it — the stickers' fills included — picks the
  // brand colour up automatically, with no per-class overrides to maintain.
  // Unset (no override) when a studio hasn't chosen one, which is the common
  // case today: the app's own rose/pink remain exactly as before.
  const brandVars = {
    ...(primaryColor ? { '--color-rose': primaryColor } : {}),
    ...(accentColor ? { '--color-pink': accentColor } : {}),
  } as CSSProperties;

  const words = studioName.split(' ');
  // Everything under the name enters after its last word has landed.
  const afterName = 80 + words.length * 110;

  return (
    <header
      style={brandVars}
      className={cn(
        'relative isolate overflow-hidden px-4 pt-14 pb-16 text-center sm:px-6 sm:pt-20 sm:pb-24',
        hasPhoto && 'border-line rounded-b-[2.5rem] border-b-[1.5px]',
      )}
    >
      {hasPhoto ? (
        <>
          {/* The parallax layer: a JS-driven translate on this wrapper, kept
              separate from the image's own CSS zoom animation below so the
              two transforms never fight over the same `transform`
              property. `overflow-hidden` plus the zoom's 6% overscan is
              what keeps a few pixels of drift from ever revealing an edge. */}
          <div
            ref={parallaxRef}
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden will-change-transform"
          >
            {/* A real photo, full-bleed. `<img>`, not next/image: a host
                pastes any URL they like into Brand Kit (same pattern as
                logo_url), so there is no fixed set of hosts to allowlist the
                way next/image's remotePatterns requires. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroPhotoUrl ?? undefined}
              alt=""
              aria-hidden="true"
              loading="eager"
              fetchPriority="high"
              className="animate-hero-zoom absolute inset-0 size-full object-cover motion-reduce:animate-none"
            />
          </div>
          {/* A scrim, not a filter on the photo itself — the image stays
              crisp, the text above it gets guaranteed contrast regardless
              of what's in the shot.

              The lightest stop is the floor, not the darkest: the body copy
              and Instagram line sit around the middle of the ramp, so the
              old `via-black/35` there measured 2.07:1 and 1.86:1 over a
              bright shot even though the bottom stop was fine. Two stops
              now, both dark enough on their own — black/60 over a white
              photo composites to #666666, 5.22:1 for photo-ink and exactly
              3.00:1 for the secondary link's `photo-ink/60` border — so the
              guarantee holds at every pixel rather than at the bottom edge.
              black/55 is not enough (4.31:1 and 2.62:1), and a `via-black/60`
              would be redundant. If this ever reads too heavy on the
              photograph, add a local scrim behind the text block; do not
              lighten the ramp back toward black/35. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-black/60 to-black/70"
          />
          {/* The dissolve: the last stretch of the hero fades all the way
              to the page's own background colour, so the seam into the
              section beneath reads as one continuous surface rather than a
              photo stopping at a hard edge. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[var(--color-buttercream)] sm:h-48"
          />
          <div
            aria-hidden="true"
            className="grain-overlay absolute inset-0 opacity-10 mix-blend-overlay"
          />
          {mayAnimate ? <ParticleField /> : null}
        </>
      ) : (
        <>
          {/* The always-on scene: three soft washes of the palette — blush
              top-left, butter top-right, sage along the foot — over the
              page-wide backdrop (`StorefrontBackdrop`), which carries the
              grain and the drifting colour for the whole page. This is the
              whole hero on a reduced-motion visit or data saver: never an
              empty or half-finished frame. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(60%_55%_at_18%_12%,var(--color-blush)_0%,transparent_65%),radial-gradient(45%_45%_at_84%_18%,var(--color-butter-soft)_0%,transparent_62%),radial-gradient(55%_50%_at_60%_100%,var(--color-sage-soft)_0%,transparent_62%)]"
          />
          {mayAnimate ? <ParticleField /> : null}
        </>
      )}

      <div className="relative z-10 mx-auto max-w-[920px]">
        {/* Stickers frame the text from the corners of the same box the text
            lives in, so they keep their distance from it at every width
            instead of being tuned to one viewport. They come before the text
            in the DOM and are painted beneath it. */}
        {hasPhoto ? null : <Stickers />}

        <div className="relative">
          <p
            className={cn(
              'font-hand animate-rise-in text-xl',
              hasPhoto ? 'text-pink' : 'text-rose-ink',
            )}
          >
            your studio bestie ✨
          </p>

          {/* Photo mode drops the name to cream-on-photo instead of
              cocoa-on-paper — the scrim above guarantees the contrast,
              not the photo's own content, which this app has no control
              over once a host pastes a link to one. */}
          <h1
            className={cn(
              'font-display mt-2 text-[clamp(46px,14vw,112px)] leading-[0.96] text-balance',
              hasPhoto && 'text-photo-ink',
            )}
          >
            <span className="sr-only">{studioName}</span>
            <span
              aria-hidden="true"
              className="flex flex-wrap items-baseline justify-center gap-x-4"
            >
              {words.map((word, index) => (
                <span
                  key={`${word}-${index}`}
                  className="animate-rise-in inline-block"
                  style={{ animationDelay: `${80 + index * 110}ms` }}
                >
                  {word}
                </span>
              ))}
            </span>
          </h1>

          <p
            className={cn(
              'animate-rise-in mx-auto mt-5 max-w-[36ch] text-[15px] text-balance sm:text-[17px]',
              // No `/90`. This block is vertically centred, i.e. mid-ramp, and
              // the suffix is what put it out of reach even over a mid-grey
              // photo; the photo/no-photo branch already carries the whole
              // hierarchy this was buying.
              hasPhoto ? 'text-photo-ink' : 'text-cocoa',
            )}
            style={{ animationDelay: `${afterName + 100}ms` }}
          >
            Come make something with your own hands — pick a class below and we&rsquo;ll keep you a
            seat ♡
          </p>

          <NextClassChip classes={classes} light={hasPhoto} delay={`${afterName + 160}ms`} />

          <div
            className="animate-rise-in mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3"
            style={{ animationDelay: `${afterName + 220}ms` }}
          >
            <a
              ref={ctaRef}
              href="#booking-widget"
              onClick={(event) => {
                event.preventDefault();
                scrollToId('booking-widget');
              }}
              className={cn(
                'sheen-on-hover group relative inline-flex min-h-[52px] items-center gap-2 overflow-hidden',
                'rounded-[var(--radius-pill)] px-7 text-[15px] font-extrabold',
                hasPhoto
                  ? 'bg-photo-ink text-cocoa'
                  : 'bg-rose text-on-rose shadow-[0_16px_32px_-14px_var(--color-rose)]',
                'transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0',
                'motion-reduce:transform-none',
                'focus-visible:outline-cocoa',
                FOCUS,
              )}
            >
              Explore classes
              <span
                aria-hidden="true"
                className="transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
              >
                →
              </span>
            </a>

            <a
              href="#how-it-works"
              onClick={(event) => {
                event.preventDefault();
                scrollToId('how-it-works');
              }}
              className={cn(
                'inline-flex min-h-[48px] items-center gap-1.5 rounded-[var(--radius-pill)] px-5 text-sm font-extrabold',
                'transition-colors duration-200',
                hasPhoto ? 'text-photo-ink hover:bg-photo-ink/10' : 'text-rose-ink hover:bg-blush',
                'focus-visible:outline-rose',
                FOCUS,
              )}
            >
              How it works
              <span aria-hidden="true">✿</span>
            </a>
          </div>

          {handle ? (
            <p
              className={cn(
                'animate-rise-in mt-6 text-sm',
                // No `/75` either — at 14px the bar is 4.5:1 and the suffix
                // measured 1.86:1 mid-ramp over a bright shot. `text-sm`
                // against the clamped display headline is the de-emphasis.
                hasPhoto ? 'text-photo-ink' : 'text-latte',
              )}
              style={{ animationDelay: `${afterName + 300}ms` }}
            >
              <a
                href={`https://instagram.com/${handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-pill)] px-2',
                  'focus-visible:outline-rose',
                  FOCUS,
                )}
              >
                Find us on Instagram{' '}
                <b className={hasPhoto ? 'text-photo-ink' : 'text-cocoa'}>@{handle}</b>
              </a>
            </p>
          ) : null}
        </div>
      </div>

      {hasPhoto ? null : <PhotoFan classes={classes} />}
    </header>
  );
}

/**
 * The sticker arrangement. Phones get the cake and the pot at the top
 * corners, where the headline never reaches (it is centred and the stickers
 * hug the edges); the palette joins from `sm`, when there is room beside
 * the copy for it. Each bobs on its own phase so no two move together.
 */
function Stickers() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <StickerCake
        className="animate-float absolute -top-11 left-1 w-14 sm:top-1 sm:left-[3%] sm:w-24 lg:-left-2 lg:w-28"
        style={{ '--float-rot': '-9deg' } as CSSProperties}
      />
      <StickerPot
        className="animate-float absolute -top-11 right-1 w-14 sm:top-8 sm:right-[3%] sm:w-24 lg:-right-2 lg:w-28"
        style={{ '--float-rot': '7deg', animationDelay: '0.9s' } as CSSProperties}
      />
      <StickerPalette
        className="animate-float absolute bottom-2 hidden w-20 sm:left-[10%] sm:block lg:left-[6%] lg:w-24"
        style={{ '--float-rot': '-6deg', animationDelay: '1.7s' } as CSSProperties}
      />
      <StickerSpark className="animate-twinkle absolute -top-6 right-[30%] w-6 sm:top-2 sm:right-[22%] sm:w-9" />
      <StickerSpark
        className="animate-twinkle absolute bottom-16 left-[8%] hidden w-5 sm:left-[24%] sm:block sm:w-6"
        style={{ animationDelay: '1.2s' }}
      />
      <StickerHeart
        className="animate-float absolute right-[10%] bottom-4 hidden w-8 sm:right-[14%] sm:block sm:w-10"
        style={{ '--float-rot': '12deg', animationDelay: '2.4s' } as CSSProperties}
      />
    </div>
  );
}

/**
 * "Next class this Friday · 8 seats left" — the soonest class and its real
 * seat count, as a little ticket. Blank (but the same height) until the
 * browser clock is known, so the buttons under it never move.
 */
function NextClassChip({
  classes,
  light,
  delay,
}: {
  classes: PublicClass[];
  light: boolean;
  delay: string;
}) {
  const now = useMountedNow();
  const soonest = nextClass(classes);

  if (!soonest) return null;

  const seats = soonest.is_full
    ? soonest.waitlist_is_open
      ? 'fully booked, waitlist open'
      : 'fully booked'
    : soonest.seats_left === 1
      ? 'last seat'
      : `${soonest.seats_left} seats left`;

  return (
    <p
      className={cn(
        'animate-rise-in mx-auto mt-5 inline-flex min-h-[40px] max-w-full items-center gap-2',
        'rounded-[var(--radius-pill)] border-[1.5px] border-dashed px-4 py-1.5 text-sm font-extrabold',
        light
          ? 'border-photo-ink/60 text-photo-ink'
          : 'border-rose-deep/40 bg-paper/80 text-cocoa backdrop-blur',
      )}
      style={{ animationDelay: delay }}
    >
      <span aria-hidden="true">🎟️</span>
      <span suppressHydrationWarning>
        {now ? `Next class ${whenCopy(soonest.starts_at, now)} · ${seats}` : ' '}
      </span>
    </p>
  );
}
