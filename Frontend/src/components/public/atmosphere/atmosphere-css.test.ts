import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The atmosphere stylesheet is read as text: jsdom does not run scroll-driven
 * animations, so what can be pinned here is the wiring. The browser behaviour
 * is measured in `e2e/atmosphere.spec.ts`.
 */

const css = readFileSync(join(__dirname, '../../../styles/units/atmosphere.css'), 'utf8');

describe('atmosphere.css', () => {
  it('registers --aurora-shift as a percentage that does not inherit', () => {
    const rule = /@property\s+--aurora-shift\s*{([^}]*)}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/syntax:\s*'<percentage>'/);
    expect(rule).toMatch(/inherits:\s*false/);
    expect(rule).toMatch(/initial-value:\s*0%/);
  });

  it('animates --aurora-shift with a keyframes block, and only when motion is welcome', () => {
    const keyframes = /@keyframes\s+aurora-shift\s*{([\s\S]*?)}\s*}/.exec(css)?.[1] ?? '';
    expect(keyframes).toContain('--aurora-shift');

    const welcome = css.slice(css.indexOf('prefers-reduced-motion: no-preference'));
    expect(welcome).toMatch(
      /\.aurora-wash[^{]*{[^}]*animation:[^;]*aurora-shift[^;]*28s[^;]*alternate/,
    );
  });

  it('drives the chapter text from the scroll only where the browser can, never with !important', () => {
    expect(css).toMatch(/@supports\s*\(animation-timeline:\s*view\(\)\)/);
    expect(css).toMatch(/animation-timeline:\s*view\(\)/);
    expect(css).not.toContain('!important');
  });
});
