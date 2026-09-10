'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * The booking page's hero — studio name, tagline, and a floating 3D craft
 * scene behind it.
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
}

export function BookingHero({ studioName, handle }: BookingHeroProps) {
  const mayAnimate = useMayAnimate();

  return (
    <header
      className={cn(
        'relative isolate overflow-hidden',
        'rounded-b-[2.5rem] border-b-[1.5px] border-line',
        'px-4 pt-10 pb-16 text-center sm:px-6 sm:pt-14 sm:pb-20',
      )}
    >
      {/* The always-on scene: gradient wash plus two drifting blobs. This is
          the whole hero on a reduced-motion visit, on data saver, or before
          the 3D layer has mounted — never an empty or half-finished frame. */}
      <div
        aria-hidden="true"
        className="from-blush via-buttercream to-pink/50 absolute inset-0 bg-gradient-to-br"
      />
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
        <CanvasBoundary>
          <Hero3D />
        </CanvasBoundary>
      ) : null}

      <div className="relative z-10">
        <p className="font-hand text-rose-ink animate-rise-in text-lg">your studio bestie ✨</p>

        <h1
          className="font-display animate-rise-in mt-1 text-[clamp(34px,9vw,52px)] leading-[1.05]"
          style={{ animationDelay: '80ms' }}
        >
          {studioName}
        </h1>

        <p
          className="text-cocoa animate-rise-in mx-auto mt-3 max-w-[34ch] text-[15px] sm:text-base"
          style={{ animationDelay: '150ms' }}
        >
          Come make something with us — pick a class and save your seat below ♡
        </p>

        {handle ? (
          <p
            className="text-latte animate-rise-in mt-4 text-sm"
            style={{ animationDelay: '220ms' }}
          >
            Find us on Instagram <b className="text-cocoa">@{handle}</b>
          </p>
        ) : null}

        <ScrollCue />
      </div>
    </header>
  );
}

/** A small nudge downward — the booking widget is one scroll away, not a tap. */
function ScrollCue() {
  return (
    <div
      aria-hidden="true"
      className="animate-rise-in mt-8 flex justify-center"
      style={{ animationDelay: '320ms' }}
    >
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
