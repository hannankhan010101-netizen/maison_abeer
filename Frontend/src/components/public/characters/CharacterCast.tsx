'use client';

import { useEffect, useRef, useState } from 'react';

import '@/styles/units/characters.css';

import { cn } from '@/lib/cn';
import { haptic, useMotionTier, type MotionTier } from '@/lib/motion';
import type { CraftKind } from '@/lib/public/studioPhotos';
import { useIsOnScreen } from '@/lib/public/useIsOnScreen';

import { CAST, castLabel } from './cast';

/**
 * The cast in the hero: one character per craft the studio teaches, each a
 * button. A tap squishes it, makes it say "wow" and pops a speech sticker with
 * the next of that craft's fun facts (cycling, read out politely).
 *
 * Idle motion follows the device: tier 0 is still and complete, tier 1 adds
 * the CSS float, tier 2 adds an occasional blink on a small timer. Everything
 * rests while the hero is off screen or the tab is hidden.
 */

/** How often a character blinks at tier 2, in ms. */
export const BLINK_EVERY_MS = 4200;
/** How long a blink holds the eyes shut. */
const BLINK_FOR_MS = 180;
/** Each character blinks on its own beat. */
const BLINK_STAGGER_MS = 1300;
/** How long "wow" lasts after a tap. */
const WOW_FOR_MS = 1200;
/** How long a speech sticker stays up. */
const SPEECH_FOR_MS = 6000;

export interface CharacterCastProps {
  crafts: CraftKind[];
  facts: Record<CraftKind, string[]>;
}

function useTabVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

export function CharacterCast({ crafts, facts }: CharacterCastProps) {
  const tier = useMotionTier();
  const [ref, onScreen] = useIsOnScreen<HTMLDivElement>();
  const visible = useTabVisible();
  const live = onScreen && visible;

  if (crafts.length === 0) return null;

  return (
    <div
      ref={ref}
      className="character-cast"
      data-count={crafts.length}
      data-paused={live ? undefined : ''}
    >
      {crafts.map((kind, slot) => (
        <CastMember
          key={kind}
          kind={kind}
          slot={slot}
          facts={facts[kind] ?? []}
          tier={tier}
          live={live}
        />
      ))}
    </div>
  );
}

function CastMember({
  kind,
  slot,
  facts,
  tier,
  live,
}: {
  kind: CraftKind;
  slot: number;
  facts: string[];
  tier: MotionTier;
  live: boolean;
}) {
  const Character = CAST[kind];
  const [factIndex, setFactIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [wow, setWow] = useState(false);
  const [blink, setBlink] = useState(false);
  const [squish, setSquish] = useState(false);
  const timers = useRef<{ wow?: number; speech?: number }>({});

  useEffect(() => {
    const pending = timers.current;
    return () => {
      window.clearTimeout(pending.wow);
      window.clearTimeout(pending.speech);
    };
  }, []);

  // The blink: tier 2 only, and only while someone could see it.
  useEffect(() => {
    if (tier < 2 || !live) return;
    let shut: number | undefined;
    let next: number;
    const schedule = (delay: number) => {
      next = window.setTimeout(() => {
        setBlink(true);
        shut = window.setTimeout(() => setBlink(false), BLINK_FOR_MS);
        schedule(BLINK_EVERY_MS);
      }, delay);
    };
    schedule(BLINK_EVERY_MS + slot * BLINK_STAGGER_MS);
    return () => {
      window.clearTimeout(next);
      window.clearTimeout(shut);
      setBlink(false);
    };
  }, [tier, live, slot]);

  const tap = () => {
    haptic('tap');
    if (tier > 0) setSquish(true);
    setWow(true);
    window.clearTimeout(timers.current.wow);
    timers.current.wow = window.setTimeout(() => setWow(false), WOW_FOR_MS);
    if (facts.length === 0) return;
    setFactIndex((index) => (index + 1) % facts.length);
    setOpen(true);
    window.clearTimeout(timers.current.speech);
    timers.current.speech = window.setTimeout(() => setOpen(false), SPEECH_FOR_MS);
  };

  const mood = wow ? 'wow' : blink ? 'sleepy' : 'happy';
  const fact = open && factIndex >= 0 ? facts[factIndex] : undefined;

  return (
    <div className="character-slot" data-slot={slot} data-craft={kind}>
      <button
        type="button"
        aria-label={castLabel(kind)}
        className={cn('character', tier > 0 && 'character-float')}
        onClick={tap}
      >
        {/* The press squishes this inner layer, so it never fights the
            float over the button's own transform. */}
        <span
          className={cn('character-body', tier > 0 && squish && 'character-squish')}
          onAnimationEnd={() => setSquish(false)}
        >
          <Character mood={mood} size={64} />
        </span>
      </button>
      <p className="character-speech" aria-live="polite" data-open={fact ? '' : undefined}>
        {fact ? (
          <span key={factIndex} className={cn(tier > 0 && 'character-pop')}>
            {fact}
          </span>
        ) : null}
      </p>
    </div>
  );
}
