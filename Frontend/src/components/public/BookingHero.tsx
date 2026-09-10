'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { ParticleField } from '@/components/public/ParticleField';
import { cn } from '@/lib/cn';
import { scrollToId } from '@/lib/public/lenisBridge';
import { useHeroParallax } from '@/lib/public/useHeroParallax';
import { useMagnetic } from '@/lib/public/useMagnetic';

/**
 * The booking page's hero — the studio's name as the actual hero, a floating
 * 3D craft scene behind it, and the studio's own brand colours carried
 * through when it has set any (Settings → Brand Kit).
 *
 * There is no photograph anywhere in this app — no logo file, no class
 * photos, nothing — and there never has been. Rather than fake that with
 * stock imagery, the hero leans on what the app already has and does well:
 * oversized display type, the three-typeface voice (serif / body /
 * handwritten), and colour. That is not a compromise; it is 2026's own
 * answer to "no photography budget" — see the plan doc for the research.
 *
 * The CSS gradient + blobs below are not a "loading state" for the 3D layer;
 * they are the actual background, painted immediately and always visible.
 * The canvas draws on top of them once (and if) it's ready. That ordering is
 * deliberate: this page's Largest Contentful Paint must never wait on
 * `three` downloading, parsing or finding a WebGL context — a guest from an
 * ad on mid-tier mobile data should see a finished-looking hero within the
 * same budget as if the 3D layer didn't exist at all.
 *
 * When a studio *has* added a real photo, the hero becomes a full-bleed
 * cinematic still rather than a UI panel laid over one: a slow ambient zoom
 * on the image, a few pixels of cursor-driven parallax on desktop, and a
 * scrim that dissolves all the way into the page's own background colour at
 * the bottom edge — so the hero doesn't end at a hard seam, it fades into
 * the section beneath it the way a page in a printed book turns.
 */

const Hero3D = dynamic(() => import('./Hero3D'), { ssr: false });

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    // A WebGL context can legitimately fail to create (old device, too many
    // contexts already open, a browser flag). The gradient behind this is a
    // complete scene on its own, so losing the 3D layer here is a downgrade,
    // not a broken page — logged for visibility, not surfaced to the guest.
    console.warn('[booking hero] 3D scene unavailable, showing the gradient only:', error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Whether it's reasonable to spend a guest's battery and, on some
 * connections, their data plan on a decorative animation.
 *
 * Three separate signals, any one of which is enough to say no:
 * `prefers-reduced-motion`, the OS-level accessibility setting; Data Saver,
 * which a visitor turns on specifically to ask sites to do less; and a
 * connection the browser itself already classifies as slow.
 */
function useMayAnimate(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    // matchMedia is missing in some test environments and a handful of
    // embedded/legacy WebViews. Either way, the safe default for a guest we
    // can't ask is "don't animate" — the CSS gradient behind this is a
    // complete scene without it.
    if (typeof window.matchMedia !== 'function') return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    type NetworkInformation = { saveData?: boolean; effectiveType?: string };
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    const dataConscious = Boolean(
      connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g',
    );

    const evaluate = () => setAllowed(!motionQuery.matches && !dataConscious);
    evaluate();

    motionQuery.addEventListener('change', evaluate);
    return () => motionQuery.removeEventListener('change', evaluate);
  }, []);

  return allowed;
}

export interface BookingHeroProps {
  studioName: string;
  handle?: string | null;
  /** From the studio's own Brand Kit. Null falls back to the app's defaults. */
  primaryColor?: string | null;
  accentColor?: string | null;
  /** A real photo of the studio, when one's been added. Null keeps the
   * type-and-colour hero exactly as before — never a placeholder box. */
  heroPhotoUrl?: string | null;
}

export function BookingHero({
  studioName,
  handle,
  primaryColor,
  accentColor,
  heroPhotoUrl,
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
  // `border-rose` etc. beneath it — including inside Hero3D — picks the
  // brand colour up automatically, with no per-class overrides to maintain.
  // Unset (no override) when a studio hasn't chosen one, which is the common
  // case today: the app's own rose/pink remain exactly as before.
  const brandVars = {
    ...(primaryColor ? { '--color-rose': primaryColor } : {}),
    ...(accentColor ? { '--color-pink': accentColor } : {}),
  } as CSSProperties;

  const words = studioName.split(' ');

  return (
    <header
      style={brandVars}
      className={cn(
        'relative isolate overflow-hidden',
        'rounded-b-[2.5rem] border-b-[1.5px] border-line',
        'px-4 pt-12 pb-24 text-center sm:px-6 sm:pt-16 sm:pb-28',
      )}
    >
      {hasPhoto ? (
        <>
          {/* The parallax layer: a JS-driven translate on this wrapper, kept
              separate from the image's own CSS zoom animation below so the
              two transforms never fight over the same `transform`
              property. `overflow-hidden` plus the zoom's 6% overscan is
              what keeps a few pixels of drift from ever revealing an edge. */}
          <div ref={parallaxRef} aria-hidden="true" className="absolute inset-0 overflow-hidden will-change-transform">
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
              of what's in the shot. Darker toward the bottom, where the
              body copy and Instagram line sit. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/70"
          />
          {/* The dissolve: the last stretch of the hero fades all the way
              to the page's own background colour, so the seam into the
              section beneath reads as one continuous surface rather than a
              photo stopping at a hard edge. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[var(--color-buttercream)] sm:h-48"
          />
          <div aria-hidden="true" className="grain-overlay absolute inset-0 mix-blend-overlay opacity-10" />
          {mayAnimate ? <ParticleField /> : null}
        </>
      ) : (
        <>
          {/* The always-on scene: gradient wash plus two drifting blobs.
              This is the whole hero on a reduced-motion visit, on data
              saver, or before the 3D layer has mounted — never an empty or
              half-finished frame. */}
          <div
            aria-hidden="true"
            className="from-blush via-buttercream to-pink/50 absolute inset-0 bg-gradient-to-br"
          />
          <div aria-hidden="true" className="grain-overlay absolute inset-0" />
          <div
            aria-hidden="true"
            className="bg-terra-soft/70 animate-drift absolute -top-20 -left-16 size-72 rounded-full blur-3xl"
          />
          <div
            aria-hidden="true"
            className="bg-sage-soft/70 animate-drift absolute -right-16 -bottom-24 size-80 rounded-full blur-3xl"
            style={{ animationDelay: '4s' }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[var(--color-buttercream)]"
          />
          {mayAnimate ? <ParticleField /> : null}
        </>
      )}

      {mayAnimate && !hasPhoto ? (
        // A hole punched straight through the middle, where the headline and
        // body copy always sit — not a suggestion the shapes are tuned to
        // respect, a guarantee that holds on any viewport shape. A short,
        // wide window (a laptop, not the phone this page is designed for)
        // is exactly where "tuned to look right on mobile" positions stop
        // being true, and text must never depend on that.
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            maskImage:
              'radial-gradient(ellipse 52% 62% at 50% 45%, transparent 0%, transparent 60%, white 100%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 52% 62% at 50% 45%, transparent 0%, transparent 60%, white 100%)',
          }}
        >
          <CanvasBoundary>
            <Hero3D primaryColor={primaryColor ?? undefined} accentColor={accentColor ?? undefined} />
          </CanvasBoundary>
        </div>
      ) : null}

      <div className="relative z-10">
        <p className={cn('font-hand animate-rise-in text-lg', hasPhoto ? 'text-pink' : 'text-rose-ink')}>
          your studio bestie ✨
        </p>

        {/* Photo mode drops the name to cream-on-photo instead of
            cocoa-on-gradient — the scrim above guarantees the contrast,
            not the photo's own content, which this app has no control
            over once a host pastes a link to one. */}
        <h1
          className={cn(
            'font-display mt-2 text-[clamp(44px,15vw,108px)] leading-[0.98]',
            hasPhoto && 'text-photo-ink',
          )}
        >
          <span className="sr-only">{studioName}</span>
          <span aria-hidden="true" className="flex flex-wrap items-baseline justify-center gap-x-4">
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
            'animate-rise-in mx-auto mt-4 max-w-[34ch] text-[15px] sm:text-base',
            hasPhoto ? 'text-photo-ink/90' : 'text-cocoa',
          )}
          style={{ animationDelay: `${80 + words.length * 110 + 100}ms` }}
        >
          Come make something with us — pick a class and save your seat below ♡
        </p>

        <a
          ref={ctaRef}
          href="#booking-widget"
          onClick={(event) => {
            event.preventDefault();
            scrollToId('booking-widget');
          }}
          className={cn(
            'animate-rise-in group mt-7 inline-flex min-h-[48px] items-center gap-2 rounded-[var(--radius-pill)]',
            'border-[1.5px] px-6 text-sm font-extrabold tracking-wide uppercase',
            'transition-colors duration-300',
            hasPhoto
              ? 'border-photo-ink/60 text-photo-ink hover:bg-photo-ink/10'
              : 'border-cocoa/40 text-cocoa hover:bg-cocoa/5',
            'focus-visible:outline-rose focus-visible:outline-[3px] focus-visible:outline-offset-2',
          )}
          style={{ animationDelay: `${80 + words.length * 110 + 180}ms` }}
        >
          Explore classes
          <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
            →
          </span>
        </a>

        {handle ? (
          <p
            className={cn(
              'animate-rise-in mt-5 text-sm',
              hasPhoto ? 'text-photo-ink/75' : 'text-latte',
            )}
            style={{ animationDelay: `${80 + words.length * 110 + 260}ms` }}
          >
            Find us on Instagram{' '}
            <b className={hasPhoto ? 'text-photo-ink' : 'text-cocoa'}>@{handle}</b>
          </p>
        ) : null}

        <ScrollCue delay={`${80 + words.length * 110 + 340}ms`} light={hasPhoto} />
      </div>
    </header>
  );
}

/** A small nudge downward — the booking widget is one scroll away, not a tap. */
function ScrollCue({ delay, light }: { delay: string; light?: boolean }) {
  return (
    <div aria-hidden="true" className="animate-rise-in mt-8 flex justify-center" style={{ animationDelay: delay }}>
      <svg
        viewBox="0 0 24 24"
        className={cn(
          'motion-safe:animate-bounce size-6 motion-reduce:animate-none',
          light ? 'text-photo-ink' : 'text-rose-ink',
        )}
        fill="none"
      >
        <path d="M12 4v14M6 12l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
