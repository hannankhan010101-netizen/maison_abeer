/**
 * WCAG 2.1 relative-luminance and contrast utilities.
 *
 * The PRD (§3.4) requires AA — 4.5:1 for body text — while the brand is built
 * on pastels, which is exactly the combination that goes wrong silently. These
 * helpers back `contrast.test.ts`, which asserts the real token file.
 */

export const AA_NORMAL = 4.5;
export const AA_LARGE = 3.0;

/** Parse `#RGB` or `#RRGGBB` into 0–255 channels. */
export function parseHex(hex: string): [number, number, number] {
  const raw = hex.trim().replace(/^#/, '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex colour: "${hex}"`);
  }

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, always >= 1. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  const hi = Math.max(first, second);
  const lo = Math.min(first, second);

  return (hi + 0.05) / (lo + 0.05);
}

/** Rounded to 2dp, which is how ratios are quoted in the ADR and token comments. */
export function ratio(a: string, b: string): number {
  return Math.round(contrastRatio(a, b) * 100) / 100;
}

export function meetsAA(a: string, b: string, large = false): boolean {
  return contrastRatio(a, b) >= (large ? AA_LARGE : AA_NORMAL);
}

/**
 * Extract `--color-*` declarations from a CSS block.
 *
 * Deliberately reads the shipped token file rather than a duplicated TS map —
 * a copy would let the stylesheet drift while the test kept passing.
 *
 * Values may be hex literals or `var(--other-token)` aliases; aliases are
 * resolved so that semantic tokens like `--color-on-rose: var(--color-cocoa)`
 * are measurable rather than invisible to the validator.
 *
 * @param css   The declaration block to read.
 * @param inherited Tokens from an outer scope, used to resolve aliases that
 *                  point at values defined elsewhere (e.g. `.mocha` aliasing a
 *                  token it does not itself redefine).
 */
export function extractColorTokens(
  css: string,
  inherited: Record<string, string> = {},
): Record<string, string> {
  const literals: Record<string, string> = {};
  const aliases: Record<string, string> = {};

  const declaration = /(--color-[\w-]+)\s*:\s*([^;]+);/g;

  for (const match of css.matchAll(declaration)) {
    const name = match[1];
    const rawValue = match[2];
    if (name === undefined || rawValue === undefined) continue;

    const value = rawValue.trim();

    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
      literals[name] = value;
      continue;
    }

    const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
    const target = alias?.[1];
    if (target !== undefined) {
      aliases[name] = target;
    }
    // Anything else (gradients, colour functions) is not a flat colour and is
    // intentionally ignored rather than guessed at.
  }

  const resolved: Record<string, string> = { ...literals };

  // Resolve aliases, following chains. Bounded by the token count, so a
  // circular definition terminates instead of hanging.
  for (const [name, target] of Object.entries(aliases)) {
    let cursor: string | undefined = target;
    const seen = new Set<string>([name]);

    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const direct = literals[cursor] ?? inherited[cursor];
      if (direct) {
        resolved[name] = direct;
        break;
      }
      cursor = aliases[cursor];
    }
  }

  return resolved;
}

/** Isolate one selector's block so `:root` and `.mocha` are read separately. */
export function extractBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Selector not found: ${selector}`);

  const open = css.indexOf('{', start);
  if (open === -1) throw new Error(`No block for selector: ${selector}`);

  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }

  throw new Error(`Unterminated block for selector: ${selector}`);
}
