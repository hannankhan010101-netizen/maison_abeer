import { prefersReducedMotion } from '@/lib/public/motion';

/**
 * A small buzz to go with a tap.
 *
 * Feedback for a thumb, so it has three ways of not happening, each of them a
 * way to buzz someone who did not want it: it does nothing where the browser
 * cannot vibrate (iOS Safari has no such API), nothing for a guest who asked
 * for less motion, and nothing on a device whose primary pointer is a mouse.
 *
 * Fire-and-forget: it never throws and never waits.
 */

export type HapticKind = 'tap' | 'success';

const PATTERNS: Record<HapticKind, number | number[]> = {
  /** One short pulse: "I registered that". */
  tap: 10,
  /** Pulse, pause, pulse: "that worked". */
  success: [12, 40, 18],
};

export function haptic(kind: HapticKind): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (prefersReducedMotion()) return;
  if (typeof window.matchMedia !== 'function' || !window.matchMedia('(pointer: coarse)').matches) {
    return;
  }

  navigator.vibrate(PATTERNS[kind]);
}
