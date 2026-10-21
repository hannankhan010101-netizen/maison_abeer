/**
 * How much motion this device gets, decided once from what the browser says.
 *
 * 0 — still: reduced motion, save-data or a slow connection.
 * 1 — light: a weak device, or one that has already dropped frames.
 * 2 — full.
 *
 * Pure, so the table of cases is tested without a browser; `useMotionTier`
 * reads the signals and feeds them in.
 */

export type MotionTier = 0 | 1 | 2;

export interface TierSignals {
  reducedMotion: boolean;
  saveData: boolean;
  slowConnection: boolean;
  deviceMemory?: number;
  cores?: number;
  lowFps?: boolean;
}

export function computeTier(signals: TierSignals): MotionTier {
  if (signals.reducedMotion || signals.saveData || signals.slowConnection) return 0;
  const weakMemory = signals.deviceMemory !== undefined && signals.deviceMemory <= 2;
  const fewCores = signals.cores !== undefined && signals.cores <= 4;
  if (weakMemory || fewCores || signals.lowFps) return 1;
  return 2;
}

/**
 * Counts frames over `windowMs` and calls `onLow` once, then stops, the first
 * time a window runs under `lowFps`.
 */
export function createFrameMonitor(opts: {
  raf: (cb: (t: number) => void) => number;
  cancel: (id: number) => void;
  onLow: () => void;
  windowMs?: number;
  lowFps?: number;
}): { start(): void; stop(): void } {
  const windowMs = opts.windowMs ?? 1000;
  const lowFps = opts.lowFps ?? 45;
  let id: number | null = null;
  let windowStart: number | null = null;
  let frames = 0;
  let done = false;

  function tick(t: number) {
    id = null;
    if (done) return;
    if (windowStart === null) {
      windowStart = t;
      frames = 0;
    } else {
      frames += 1;
      const elapsed = t - windowStart;
      if (elapsed >= windowMs) {
        if ((frames * 1000) / elapsed < lowFps) {
          done = true;
          opts.onLow();
          return;
        }
        windowStart = t;
        frames = 0;
      }
    }
    id = opts.raf(tick);
  }

  return {
    start() {
      if (done || id !== null) return;
      windowStart = null;
      id = opts.raf(tick);
    },
    stop() {
      if (id !== null) opts.cancel(id);
      id = null;
    },
  };
}
