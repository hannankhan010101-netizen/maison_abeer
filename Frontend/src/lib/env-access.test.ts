import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `NEXT_PUBLIC_*` must be read as a static literal.
 *
 * Next inlines these at build time by substituting the literal expression
 * `process.env.NEXT_PUBLIC_FOO`. A dynamic key — `process.env[name]` — cannot
 * be statically analysed, so it is left untouched, and in the browser
 * `process.env` is an empty object. Every lookup then returns undefined
 * however correctly the variable is configured.
 *
 * This is a source-level check rather than a behavioural one on purpose: no
 * unit test can catch it. Vitest runs in Node, where `process.env` is a real
 * object and the dynamic read works perfectly. It only fails in a browser,
 * which is exactly where it did — sign-in reported "we couldn't reach the
 * studio" while never making a request at all.
 */

const SRC = join(process.cwd(), 'src');

/** Comments describe the hazard; only real code can commit it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) {
      found.push(path);
    }
  }

  return found;
}

describe('environment variable access', () => {
  it('never reads process.env with a computed key', () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => /process\.env\s*\[/.test(withoutComments(readFileSync(path, 'utf8'))))
      .map((path) => path.replace(process.cwd(), ''));

    expect(
      offenders,
      'a computed key is not inlined by Next and is undefined in the browser',
    ).toEqual([]);
  });

  it('the Supabase client reads both of its variables literally', () => {
    const source = readFileSync(join(SRC, 'lib', 'supabase', 'client.ts'), 'utf8');

    expect(source).toContain('process.env.NEXT_PUBLIC_SUPABASE_URL');
    expect(source).toContain('process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });
});
