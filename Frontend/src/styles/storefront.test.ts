import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { extractBlock, extractColorTokens } from './contrast';

/**
 * `.storefront` pins the public booking page to the light palette whatever
 * the visitor's phone prefers (see the block's own comment in tokens.css).
 *
 * The pin only works if it is complete: a colour token added to `:root` and
 * flipped by `.mocha` but forgotten here would flip on the storefront alone,
 * on dark-mode phones only — the kind of defect nobody on a laptop sees.
 */

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');

const root = extractColorTokens(extractBlock(css, ':root'));
const mocha = extractColorTokens(extractBlock(css, '.mocha'), root);
const storefront = extractColorTokens(extractBlock(css, '.storefront'));

describe('.storefront pins the light palette', () => {
  it('restates every colour token :root declares', () => {
    expect(Object.keys(storefront).sort()).toEqual(Object.keys(root).sort());
  });

  it('to the light values, verbatim', () => {
    expect(storefront).toEqual(root);
  });

  it('so covers every token mocha flips', () => {
    for (const token of Object.keys(mocha)) {
      expect(storefront[token], token).toBe(root[token]);
    }
  });
});
