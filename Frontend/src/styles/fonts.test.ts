import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { extractBlock } from './contrast';

/**
 * The typefaces: loaded from files in the repo, and read through the variable.
 *
 * `next/font` gives each face a CSS variable (`--font-display-loaded` …) that
 * holds the real family *and* a size-adjusted fallback, so the system font a
 * visitor sees while the file loads has the same metrics and the page does not
 * jump when the real one arrives. `tokens.css` used to name the families as
 * plain strings and skip the variable, discarding that fallback. And the faces
 * came from Google at build time: on a machine that cannot reach it the build
 * silently falls back to system fonts, so what a developer saw locally was not
 * what shipped. These tests hold the layout and the tokens together so neither
 * half can drift.
 */

const SRC = join(__dirname, '..');
const tokens = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
const layout = readFileSync(join(SRC, 'app/layout.tsx'), 'utf8');
const root = extractBlock(tokens, ':root');

const ROLES = ['display', 'body', 'hand'] as const;

describe('typefaces', () => {
  it.each(ROLES)('--font-%s consumes the variable next/font defines, first', (role) => {
    const declaration = new RegExp(`--font-${role}:\\s*([^;]+);`).exec(root);

    expect(declaration, `--font-${role} is missing from tokens.css`).not.toBeNull();
    // The loaded family leads, carrying its size-adjusted fallback with it.
    expect(declaration![1]!.trim()).toMatch(new RegExp(`^var\\(--font-${role}-loaded\\)`));
    expect(layout).toContain(`variable: '--font-${role}-loaded'`);
  });

  it('loads every face from a file in the repo, never from Google', () => {
    // Import statements, not substrings: the layout's comment explains why it
    // does not use the Google loader, and names it.
    expect(layout).toMatch(/from\s+'next\/font\/local'/);
    expect(layout).not.toMatch(/from\s+['"]next\/font\/google['"]/);

    const paths = [...layout.matchAll(/src:\s*'([^']+)'/g)].map((match) => match[1]!);

    expect(paths.length).toBeGreaterThanOrEqual(ROLES.length);
    for (const path of paths) {
      expect(existsSync(join(SRC, 'app', path)), `${path} is not on disk`).toBe(true);
    }
  });

  it('keeps the licence and source of every font file beside them', () => {
    const credits = readFileSync(join(SRC, 'fonts/CREDITS.md'), 'utf8');

    for (const file of [
      'young-serif.woff2',
      'nunito-variable.woff2',
      'caveat-variable.woff2',
      'fraunces-variable.woff2',
    ]) {
      expect(existsSync(join(SRC, 'fonts', file)), file).toBe(true);
      expect(credits, file).toContain(file);
    }
    expect(credits).toContain('SIL Open Font License');
  });
});
