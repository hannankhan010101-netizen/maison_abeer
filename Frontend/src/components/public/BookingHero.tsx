'use client';

import type { CSSProperties } from 'react';

import '@/styles/units/hero.css';

import { SplitHeading } from '@/components/motion/SplitHeading';
import { Tilt } from '@/components/motion/Tilt';
import { CharacterCast } from '@/components/public/characters/CharacterCast';
import { StickerHeart, StickerSpark } from '@/components/public/CraftStickers';
import { useCraftFacts } from '@/components/public/hero/useCraftFacts';
import { VerbRoll } from '@/components/public/hero/VerbRoll';
import { ParticleField } from '@/components/public/ParticleField';
import { PhotoFan } from '@/components/public/PhotoFan';
import { cn } from '@/lib/cn';
import type { PublicClass } from '@/lib/public/api';
import { FALLBACK_VERB, verbsFor } from '@/lib/public/craftVerbs';
import { nextClass, whenCopy } from '@/lib/public/format';
import { displayHandle, instagramUrl } from '@/lib/public/instagram';
import { scrollToId } from '@/lib/public/lenisBridge';
import { craftsIn } from '@/lib/public/studioPhotos';
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

/** Gap between one headline letter and the next, in ms. */
const LETTER_STAGGER_MS = 28;

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
  // Parsed once: no link, and no stray "@", unless the handle is valid.
  const instagram = instagramUrl(handle);
  const shownHandle = displayHandle(handle);
  const hasPhoto = Boolean(heroPhotoUrl);
  const parallaxRef = useHeroParallax<HTMLDivElement>();
  const ctaRef = useMagnetic<HTMLAnchorElement>();
  // Derived from the class list exactly as the chapters are. Still "make"
  // whenever the roll may not run, so the static line claims no one craft.
  const crafts = craftsIn(classes.map((item) => item.color_token));
  const verbs = mayAnimate ? verbsFor(crafts) : [FALLBACK_VERB];
  const facts = useCraftFacts();

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

  // Everything under the name enters after its last letter has landed.
  const afterName = 80 + Array.from(studioName.replace(/\s/g, '')).length * LETTER_STAGGER_MS;

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
            in the DOM and are painted beneath it.
            The cast (one character per craft taught) sits in the band of
            the header's top padding, above the text, so it covers no word;
            see characters.css. Like the stickers, it leaves a photo alone. */}
        {hasPhoto ? null : <Stickers />}
        {hasPhoto ? null : <CharacterCast crafts={crafts} facts={facts} />}

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
          <SplitHeading
            as="h1"
            text={studioName}
            startDelayMs={80}
            staggerMs={LETTER_STAGGER_MS}
            className={cn(
              'hero-title font-display mt-2 text-[clamp(46px,14vw,112px)] leading-[0.96] text-balance',
              hasPhoto && 'text-photo-ink',
            )}
          />

          {/* The promise, in display type: "come throw something with your
              own hands", its verb rolling through the crafts the classes
              teach. The rolling line is aria-hidden; a screen reader hears
              the one plain sentence in the sr-only copy and no live region.
              Its measure is 14em, not 22ch: `ch` is the width of the face's
              "0", so a 22ch box was 242px in the fallback and 308px in
              Fraunces, and the line rewrapped when the font arrived. 14em is
              Fraunces's 22ch, in a unit no face changes.
              Under reduced motion or Data Saver the verb is a still "make".
              Over a photo the verb takes the pink, as the "bestie" line
              does: the rose ink is a paper colour, not a photo one. */}
          <p
            className={cn(
              'hero-promise font-display animate-rise-in mx-auto mt-5 max-w-[14em]',
              'text-[clamp(22px,3.2vw,40px)] leading-[1.1] text-balance',
              hasPhoto ? 'text-photo-ink' : 'text-cocoa',
            )}
            style={{ animationDelay: `${afterName + 100}ms` }}
          >
            <span className="sr-only">come {FALLBACK_VERB} something with your own hands</span>
            <span aria-hidden="true">
              come <VerbRoll verbs={verbs} className={hasPhoto ? 'text-pink' : 'text-rose-ink'} />{' '}
              something with your own hands
            </span>
          </p>

          <NextClassChip classes={classes} light={hasPhoto} delay={`${afterName + 160}ms`} />

          <div
            className="animate-rise-in mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3"
            style={{ animationDelay: `${afterName + 220}ms` }}
          >
            <a
              ref={ctaRef}
              href="#booking-widget"
              style={{ '--clay-glow': 'var(--color-rose)' } as CSSProperties}
              onClick={(event) => {
                event.preventDefault();
                scrollToId('booking-widget');
              }}
              className={cn(
                'clay sheen-on-hover group relative inline-flex min-h-[52px] items-center gap-2 overflow-hidden',
                'rounded-[var(--radius-pill)] px-7 text-[15px] font-extrabold',
                hasPhoto ? 'bg-photo-ink text-cocoa' : 'bg-rose text-on-rose',
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

          {instagram && shownHandle ? (
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
                href={instagram}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-pill)] px-2',
                  'focus-visible:outline-rose',
                  FOCUS,
                )}
              >
                Find us on Instagram{' '}
                <b className={hasPhoto ? 'text-photo-ink' : 'text-cocoa'}>{shownHandle}</b>
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
 * The sticker arrangement: sparks and a heart around the copy. The craft
 * stickers that used to hold the corners are now the cast (`CharacterCast`).
 */
function Stickers() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
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
    // The chip's own rounding is repeated on the Tilt's inner layer, so the glare is clipped to
    // the pill's shape rather than lighting a rectangle around it.
    <Tilt
      maxDeg={6}
      glare
      className="mt-5 inline-flex max-w-full [&>div]:rounded-[var(--radius-pill)]"
    >
      <p
        className={cn(
          'animate-rise-in inline-flex min-h-[40px] max-w-full items-center gap-2',
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
    </Tilt>
  );
}
