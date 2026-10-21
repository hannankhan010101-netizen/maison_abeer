'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';

/**
 * A below-the-fold section that costs nothing until it is nearly in view.
 *
 * The page's first load should carry the hero and the booking card, not every
 * section beneath them. This wraps one section: it reserves the section's
 * height (so the page never jumps), watches for it to come within a screen or
 * so of the viewport, then fetches its code once and mounts it. The browser is
 * also told it may skip painting the placeholder until it is shown.
 *
 * If the code cannot be fetched (a deploy replaced the chunk, a dead
 * connection) the placeholder stays, a single line goes to the console, and
 * nothing throws: a missing decorative section must never break the booking
 * card that sits above it.
 */

export interface LazySectionProps<P extends object> {
  load: () => Promise<{ default: ComponentType<P> }>;
  props: P;
  /** The section's rough height, so the page holds its shape until it loads. */
  minHeight: string;
  /** How far before the viewport to start loading. */
  rootMargin?: string;
  /** For people inspecting the page; never shown. */
  label: string;
}

export function LazySection<P extends object>({
  load,
  props,
  minHeight,
  rootMargin = '600px 0px',
  label,
}: LazySectionProps<P>) {
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [Loaded, setLoaded] = useState<ComponentType<P> | null>(null);

  useEffect(() => {
    let cancelled = false;

    function start() {
      if (started.current) return;
      started.current = true;

      load()
        .then((module) => {
          if (!cancelled) setLoaded(() => module.default);
        })
        .catch((error: unknown) => {
          console.error(`[storefront] could not load "${label}":`, error);
        });
    }

    if (typeof IntersectionObserver === 'undefined') {
      start();
      return () => {
        cancelled = true;
      };
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          start();
        }
      },
      { rootMargin },
    );

    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // `load` and `props` are meant to be stable; the section loads once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootMargin, label]);

  if (Loaded) {
    return (
      <div data-lazy-section={label} data-loaded="">
        <Loaded {...props} />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-lazy-section={label}
      aria-hidden="true"
      style={{
        minHeight,
        contentVisibility: 'auto',
        containIntrinsicSize: `auto ${minHeight}`,
      }}
    />
  );
}
