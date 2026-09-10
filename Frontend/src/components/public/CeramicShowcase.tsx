'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';

/**
 * "Shaped by hand" — the one place on this page a guest sees the actual
 * object rather than a photo of the process. It only ever mounts once this
 * section has scrolled near the viewport (`useRevealOnScroll` below gates
 * the dynamic import itself, not just its opacity), so `three` and
 * `@react-three/fiber` are never fetched for a guest who never scrolls this
 * far — the same reasoning as `Hero3D`, applied a second time to a second
 * scene rather than assumed to already cover it.
 *
 * The object and the copy sit in their own halves of the layout rather than
 * stacked on top of each other: a slowly turning 3D shape behind a headline
 * is exactly the "distracting, reduces legibility" case §27 warns against —
 * this page already fixed that mistake once, in the hero, and isn't
 * repeating it here.
 */

const CeramicScene = dynamic(() => import('./CeramicScene'), { ssr: false });

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn('[ceramic showcase] 3D scene unavailable, showing the static form instead:', error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function useMayAnimate(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
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

/** A hand-drawn silhouette standing in for the 3D piece — the whole
 * section's content under reduced motion, on data saver, or before the
 * scene has mounted. Never an empty box waiting on `three`. */
function StaticVase() {
  return (
    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
      <div className="bg-terra-soft/50 size-40 rounded-full blur-2xl sm:size-52" />
      <svg viewBox="0 0 100 100" className="text-terra/70 absolute size-24 sm:size-32" fill="none">
        <path
          d="M38 14c-3 6-3 10 1 13-8 3-13 11-11 21 2 11 11 19 22 19s20-8 22-19c2-10-3-18-11-21 4-3 4-7 1-13"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function CeramicShowcase() {
  const [ref, visible] = useRevealOnScroll<HTMLElement>();
  const mayAnimate = useMayAnimate();
  const showScene = visible && mayAnimate;

  return (
    <section
      ref={ref}
      aria-label="Shaped by hand"
      className="border-line bg-blush/30 mx-4 grid overflow-hidden rounded-[var(--radius-lg)] border-[1.5px] sm:mx-6 md:grid-cols-2"
    >
      <div className="relative h-72 sm:h-80 md:h-auto">
        <div className="from-blush via-buttercream to-sage-soft/60 absolute inset-0 bg-gradient-to-br" />
        <div aria-hidden="true" className="grain-overlay absolute inset-0" />
        {showScene ? (
          <CanvasBoundary>
            <CeramicScene />
          </CanvasBoundary>
        ) : (
          <StaticVase />
        )}
      </div>

      <div
        className={cn(
          'flex flex-col justify-center px-6 py-12 text-center transition-[opacity,transform] duration-700 sm:py-16 md:px-10 md:text-left',
          visible ? 'opacity-100' : 'opacity-0 translate-y-4',
        )}
      >
        <p className="font-hand text-rose-ink text-lg">turn, and turn again</p>
        <h2 className="font-display mt-1 text-[clamp(26px,5vw,38px)] leading-[1.08]">
          Shaped by hand, not by machine
        </h2>
        <p className="text-cocoa mx-auto mt-4 max-w-[36ch] text-[15px] sm:text-base md:mx-0">
          Every piece that leaves here carries a small imperfection — the mark of a hand on the
          wheel, not a mould. That&rsquo;s the whole point.
        </p>
      </div>
    </section>
  );
}
