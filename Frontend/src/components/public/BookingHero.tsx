'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

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
}

export function BookingHero({ studioName, handle, primaryColor, accentColor }: BookingHeroProps) {
  const mayAnimate = useMayAnimate();

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
        'px-4 pt-12 pb-20 text-center sm:px-6 sm:pt-16 sm:pb-24',
      )}
    >
      {/* The always-on scene: gradient wash plus two drifting blobs. This is
          the whole hero on a reduced-motion visit, on data saver, or before
          the 3D layer has mounted — never an empty or half-finished frame. */}
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

      {mayAnimate ? (
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
        <p className="font-hand text-rose-ink animate-rise-in text-lg">your studio bestie ✨</p>

        {/* The name IS the hero — no stand-in photograph, so the type
            carries the whole first impression. Each word rises in on its
            own beat rather than the line arriving as one block, which is
            what makes it read as a designed reveal instead of a heading
            that merely renders.

            The split-per-word markup below is purely decorative
            (aria-hidden): a screen reader spelling out "Maison" — pause —
            "Abeer" as two separate announcements is worse than one name
            read normally, so the real accessible (and test-findable) text
            is this one hidden node with the name intact as a single string. */}
        <h1 className="font-display mt-2 text-[clamp(44px,15vw,108px)] leading-[0.98]">
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
          className="text-cocoa animate-rise-in mx-auto mt-4 max-w-[34ch] text-[15px] sm:text-base"
          style={{ animationDelay: `${80 + words.length * 110 + 100}ms` }}
        >
          Come make something with us — pick a class and save your seat below ♡
        </p>

        {handle ? (
          <p
            className="text-latte animate-rise-in mt-4 text-sm"
            style={{ animationDelay: `${80 + words.length * 110 + 180}ms` }}
          >
            Find us on Instagram <b className="text-cocoa">@{handle}</b>
          </p>
        ) : null}

        <ScrollCue delay={`${80 + words.length * 110 + 260}ms`} />
      </div>
    </header>
  );
}

/** A small nudge downward — the booking widget is one scroll away, not a tap. */
function ScrollCue({ delay }: { delay: string }) {
  return (
    <div aria-hidden="true" className="animate-rise-in mt-8 flex justify-center" style={{ animationDelay: delay }}>
      <svg
        viewBox="0 0 24 24"
        className="text-rose-ink motion-safe:animate-bounce size-6 motion-reduce:animate-none"
        fill="none"
      >
        <path d="M12 4v14M6 12l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
