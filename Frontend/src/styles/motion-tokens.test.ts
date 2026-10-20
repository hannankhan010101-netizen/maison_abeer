import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { extractBlock } from './contrast';

/**
 * The motion vocabulary, as tokens.
 *
 * Every effect on the storefront reads its timing and easing from here rather
 * than inventing a curve in place, so "how things move" is one decision that
 * can be changed in one file — and a spring written once, correctly, instead of
 * a dozen cubic-beziers that each almost overshoot.
 */

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
const globals = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');
const root = extractBlock(css, ':root');

function declared(token: string): string {
  const match = new RegExp(`${token}:\\s*([^;]+);`).exec(root);
  if (!match) throw new Error(`${token} is missing from tokens.css`);
  return match[1]!.trim();
}

function ms(token: string): number {
  const match = /^(\d+(?:\.\d+)?)ms$/.exec(declared(token));
  if (!match) throw new Error(`${token} is not a millisecond value`);
  return Number(match[1]);
}

describe('motion tokens', () => {
  it('has three durations, each longer than the last', () => {
    expect(ms('--dur-fast')).toBeLessThan(ms('--dur-base'));
    expect(ms('--dur-base')).toBeLessThan(ms('--dur-slow'));
  });

  it('keeps a feedback duration fast enough to feel instant', () => {
    // Anything over ~200ms between a tap and a response reads as lag.
    expect(ms('--dur-fast')).toBeLessThanOrEqual(200);
  });

  it('has an ease-out for entrances', () => {
    expect(declared('--ease-out-expo')).toMatch(/^cubic-bezier\(/);
  });

  it.each(['--ease-spring-soft', '--ease-spring-bouncy'])(
    '%s is a real spring: a linear() curve that overshoots 1 and lands on it',
    (token) => {
      const value = declared(token);
      expect(value).toMatch(/^linear\(/);

      const samples = [...value.matchAll(/(-?\d*\.?\d+)(?:\s+[\d.]+%)?(?=\s*[,)])/g)].map((m) =>
        Number(m[1]),
      );

      expect(samples.length).toBeGreaterThan(12);
      expect(samples[0]).toBe(0);
      expect(samples[samples.length - 1]).toBe(1);
      // The overshoot is the whole point of a spring.
      expect(Math.max(...samples)).toBeGreaterThan(1);
    },
  );

  it('overshoots more when bouncy than when soft', () => {
    const peak = (token: string) =>
      Math.max(
        ...[...declared(token).matchAll(/(-?\d*\.?\d+)(?:\s+[\d.]+%)?(?=\s*[,)])/g)].map((m) =>
          Number(m[1]),
        ),
      );

    expect(peak('--ease-spring-bouncy')).toBeGreaterThan(peak('--ease-spring-soft'));
  });

  it('leaves the existing --ease-spring untouched', () => {
    expect(declared('--ease-spring')).toBe('cubic-bezier(0.34, 1.56, 0.64, 1)');
  });
});

describe('.clay', () => {
  it('is a utility, with a pressed state', () => {
    expect(globals).toMatch(/\.clay\s*\{/);
    expect(globals).toMatch(/\.clay:active\s*\{/);
  });

  it('is built from an inner highlight, an inner shade and a soft drop shadow', () => {
    const block = /\.clay\s*\{([^}]*)\}/.exec(globals)?.[1] ?? '';

    expect(block).toMatch(/inset 0 2px 0/); // the top highlight
    expect(block).toMatch(/inset 0 -\d+px/); // the bottom shade
    expect(block).toContain('var(--clay-glow');
  });
});

describe('the global reduced-motion rule', () => {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
  const open = css.indexOf('{', start);
  const rule =
    start === -1 ? '' : extractBlock(css.slice(start), '@media (prefers-reduced-motion: reduce)');

  it('exists, and applies to every element and pseudo-element', () => {
    expect(open).toBeGreaterThan(-1);
    expect(rule).toMatch(/\*,\s*\*::before,\s*\*::after/);
  });

  it.each([
    ['animation-duration', '0.01ms'],
    ['animation-iteration-count', '1'],
    ['transition-duration', '0.01ms'],
    // A delay is still motion's schedule. Left alone, a staggered entrance keeps
    // its elements hidden until the delay runs out, and the browser reports an
    // animation "running" for as long as it waits — a 9-second delay on a
    // backdrop wash did exactly that.
    ['animation-delay', '0s'],
    ['transition-delay', '0s'],
    ['scroll-behavior', 'auto'],
  ])('sets %s to %s, and does not let an inline style win', (property, value) => {
    expect(rule).toMatch(new RegExp(`${property}:\\s*${value.replace('.', '\\.')}\\s*!important`));
  });
});
