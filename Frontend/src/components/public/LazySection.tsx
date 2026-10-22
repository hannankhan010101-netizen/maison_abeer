'use client';

import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react';

import '@/styles/units/lazy.css';

/**
 * A below-the-fold section that costs nothing until it is nearly in view.
 *
 * The page's first load should carry the hero and the booking card, not every
 * section beneath them. This wraps one section: it reserves the section's
 * height (so the page never jumps), watches for it to come within a screen or
 * so of the viewport, then mounts it. The browser is also told it may skip
 * painting the placeholder until it is shown.
 *
 * The code is fetched twice-over cheaply: once in idle time after the page has
 * settled (so the chunk is already there when a quick scroll arrives, and the
 * section never pops in while it is on screen), and again, if that failed, on
 * arrival. The idle fetch does not mount anything, is skipped for visitors who
 * asked to save data or are on a very slow connection, and is not part of the
 * page's first load.
 *
 * If the code cannot be fetched (a deploy replaced the chunk, a dead
 * connection) the placeholder stays, a single line goes to the console, and
 * nothing throws: a missing decorative section must never break the booking
 * card that sits above it.
 */

export interface LazySectionProps<P extends object> {
  load: () => Promise<{ default: ComponentType<P> }>;
  props: P;
  /** The section's rough height on a phone, so the page holds its shape until it loads. */
  minHeight: string;
  /** Its rough height from the `lg` breakpoint up, when it differs (a pinned scene is far taller). */
  minHeightLg?: string;
  /** How far before the viewport to start loading. */
  rootMargin?: string;
  /** For people inspecting the page; never shown. */
  label: string;
  /** Fetch the code in idle time so a fast scroll finds it ready. On by default. */
  prefetch?: boolean;
}

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

function dataConscious(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  return Boolean(
    connection?.saveData ||
    connection?.effectiveType === 'slow-2g' ||
    connection?.effectiveType === '2g',
  );
}

export function LazySection<P extends object>({
  load,
  props,
  minHeight,
  minHeightLg,
  rootMargin = '600px 0px',
  label,
  prefetch = true,
}: LazySectionProps<P>) {
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const code = useRef<Promise<{ default: ComponentType<P> }> | null>(null);
  const [Loaded, setLoaded] = useState<ComponentType<P> | null>(null);

  useEffect(() => {
    let cancelled = false;

    /** One fetch, shared by the idle prefetch and the arrival; a failure is forgotten so arrival can retry. */
    function fetchCode() {
      code.current ??= load().catch((error: unknown) => {
        code.current = null;
        throw error;
      });
      return code.current;
    }

    function start() {
      if (started.current) return;
      started.current = true;

      fetchCode()
        .then((module) => {
          if (!cancelled) setLoaded(() => module.default);
        })
        .catch((error: unknown) => {
          started.current = false;
          console.error(`[storefront] could not load "${label}":`, error);
        });
    }

    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    if (prefetch && !dataConscious()) {
      const warm = () => {
        if (!cancelled) void fetchCode().catch(() => {});
      };
      if (typeof requestIdleCallback === 'function') {
        idleHandle = requestIdleCallback(warm, { timeout: 4000 });
      } else {
        timeoutHandle = setTimeout(warm, 2000);
      }
    }

    function stopIdle() {
      if (idleHandle !== undefined && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }

    if (typeof IntersectionObserver === 'undefined') {
      start();
      return () => {
        cancelled = true;
        stopIdle();
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
      stopIdle();
      observer.disconnect();
    };
    // `load` and `props` are meant to be stable; the section loads once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootMargin, label, prefetch]);

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
      className="lazy-section"
      style={
        {
          '--lazy-h': minHeight,
          '--lazy-h-lg': minHeightLg ?? minHeight,
          contentVisibility: 'auto',
          containIntrinsicSize: `auto ${minHeight}`,
        } as CSSProperties
      }
    />
  );
}
