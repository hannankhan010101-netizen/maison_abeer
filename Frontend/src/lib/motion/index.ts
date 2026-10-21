/**
 * The motion kit, in one import.
 *
 * Phase 0 builds only what two or more screens need. An effect with a single
 * consumer lives beside that consumer and moves in here when a second one
 * appears.
 */
export { loadGsap, type GsapKit, type GsapPluginName } from './gsap';
export { haptic, type HapticKind } from './haptics';
export { withViewTransition } from './viewTransition';
export { useTilt } from './useTilt';
export { useMotionTier, type MotionTier, type TierSignals } from './useMotionTier';
export { useMayAnimate } from '@/lib/public/useMayAnimate';
export { prefersReducedMotion } from '@/lib/public/motion';
