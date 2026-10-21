import { useEffect, useState } from 'react';

import { computeTier, createFrameMonitor, type MotionTier, type TierSignals } from './tier';

export type { MotionTier, TierSignals } from './tier';

/**
 * The page's motion tier (see `tier.ts`), read once the page has mounted.
 *
 * The server and the first client render both say 0, so hydration never
 * mismatches and nothing moves before we have looked. After mount it reads
 * the browser's signals, watches the frame rate while at tier 2, and follows a
 * live reduced-motion change. It only ever steps down within a session: the
 * ceiling lives at module level, so a later signal (or a remount) cannot raise
 * it again. The tier is mirrored to `<html data-motion-tier>` for CSS.
 *
 * `useMayAnimate` is unchanged; its callers move over in a later phase.
 */

let ceiling: MotionTier = 2;
let droppedFrames = false;

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

function readSignals(reducedMotion: boolean): TierSignals {
  const nav = navigator as Navigator & {
    connection?: NetworkInformation;
    deviceMemory?: number;
  };
  const connection = nav.connection;
  return {
    reducedMotion,
    saveData: Boolean(connection?.saveData),
    slowConnection: connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g',
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    lowFps: droppedFrames,
  };
}

export function useMotionTier(): MotionTier {
  const [tier, setTier] = useState<MotionTier>(0);

  useEffect(() => {
    // Can't ask means do less: stay at 0.
    if (typeof window.matchMedia !== 'function') return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let monitor: { stop(): void } | null = null;

    const settle = () => {
      const next = Math.min(ceiling, computeTier(readSignals(motionQuery.matches))) as MotionTier;
      ceiling = next;
      setTier(next);

      if (next === 2 && !monitor && typeof window.requestAnimationFrame === 'function') {
        const created = createFrameMonitor({
          raf: (cb) => window.requestAnimationFrame(cb),
          cancel: (id) => window.cancelAnimationFrame(id),
          onLow: () => {
            droppedFrames = true;
            settle();
          },
        });
        monitor = created;
        created.start();
      } else if (next < 2 && monitor) {
        monitor.stop();
        monitor = null;
      }
    };

    settle();
    motionQuery.addEventListener('change', settle);
    return () => {
      motionQuery.removeEventListener('change', settle);
      monitor?.stop();
      monitor = null;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motionTier = String(tier);
  }, [tier]);

  return tier;
}
