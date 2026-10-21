import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The footer's stylesheet: a handwritten line that draws itself, once, in view. */

const path = join(__dirname, 'units', 'footer.css');
const css = existsSync(path) ? readFileSync(path, 'utf8') : '';

const MOTION = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{([\s\S]*)\}\s*$/;

/** Everything inside the reduced-motion no-preference block (assumed last). */
const inside = MOTION.exec(css)?.[1] ?? '';
/** Everything outside it. */
const outside = css.replace(MOTION, '');

/** The declarations of the first rule in `source` whose selector is exactly `selector`. */
function rule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  return match?.[1] ?? '';
}

describe('footer.css', () => {
  it('exists and is imported by the footer', () => {
    expect(existsSync(path)).toBe(true);
    const component = readFileSync(
      join(__dirname, '..', 'components', 'public', 'StudioFooter.tsx'),
      'utf8',
    );
    expect(component).toContain("import '@/styles/units/footer.css'");
  });

  it('leaves the line simply drawn outside the motion block', () => {
    const base = rule(outside, '.signoff-stroke');
    expect(base).toMatch(/stroke-dasharray\s*:\s*1/);
    expect(base).toMatch(/stroke-dashoffset\s*:\s*0\s*;/);
    expect(outside).not.toMatch(/stroke-dashoffset\s*:\s*1/);
    expect(outside).not.toMatch(/animation\s*:|transition\s*:/);
  });

  it('hides the line only while the footer has not been seen, and only with motion allowed', () => {
    const hidden = rule(inside, 'footer:not([data-visible]) .signoff-stroke');
    expect(hidden).toMatch(/stroke-dashoffset\s*:\s*1\s*;/);
  });

  it('draws it to 0 on the expo ease once the footer is visible', () => {
    const drawn = rule(inside, '[data-visible] .signoff-stroke');
    expect(drawn).toMatch(/stroke-dashoffset\s*:\s*0\s*;/);
    expect(drawn).toMatch(/transition\s*:[^;]*stroke-dashoffset[^;]*var\(--ease-out-expo\)/);
  });

  it('forces nothing', () => {
    expect(css).not.toMatch(/!important/);
  });
});
