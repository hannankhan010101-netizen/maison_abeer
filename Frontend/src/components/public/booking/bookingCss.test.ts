import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles/units/booking.css'), 'utf8');

/** Every `selector { body }` pair, at any nesting depth, with the inner-most body. */
function rules(text: string) {
  return Array.from(text.matchAll(/([^{}]+)\{([^{}]*)\}/g)).map((m) => ({
    selector: m[1]!.trim(),
    body: m[2]!,
  }));
}

describe('booking.css', () => {
  it('lets every transformed SVG child of the check scale from its own centre', () => {
    const all = rules(css);
    const keyframesWithTransform = new Set(
      Array.from(css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g))
        .filter((m) => /transform\s*:/.test(m[2]!))
        .map((m) => m[1]!),
    );

    const animated = all.filter(
      (rule) =>
        /^\.booking-check\s+\w+/.test(rule.selector) &&
        Array.from(keyframesWithTransform).some((name) => rule.body.includes(`animation: ${name}`)),
    );
    // The guard must see something, or it would pass for the wrong reason.
    expect(animated.length).toBeGreaterThan(0);

    for (const { selector } of animated) {
      const mine = all
        .filter((rule) => rule.selector === selector || rule.selector === '.booking-check *')
        .map((rule) => rule.body)
        .join('\n');
      expect(mine, selector).toMatch(/transform-box:\s*fill-box/);
      expect(mine, selector).toMatch(/transform-origin:\s*center/);
    }
  });
});
