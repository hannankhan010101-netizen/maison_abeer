// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * The first-load budget check, run the way CI and the gate run it: as a
 * process, judged by its exit code and what it prints.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'check-first-load.mjs');
const DIST = join(HERE, '__fixtures__', 'dist');
const PAGE = '/book/[slug]/page';

function run(...args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args.map(String)], { encoding: 'utf8' });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

/** The fixture page lists a.js twice and b.js once, plus a CSS file that does not count. */
function expectedKb() {
  const size = (file) =>
    gzipSync(readFileSync(join(DIST, 'static', 'chunks', file)), { level: 6 }).length;
  return (size('a.js') + size('b.js')) / 1024;
}

describe('check-first-load', () => {
  it('passes under the budget and prints the exact number', () => {
    const kb = expectedKb();
    const { code, out } = run(DIST, PAGE, kb, 0);
    expect(code).toBe(0);
    expect(out).toContain(`${kb.toFixed(2)} KiB`);
  });

  it('fails over the budget, saying by how much', () => {
    const kb = expectedKb();
    const { code, out } = run(DIST, PAGE, kb - 1, 0.5);
    expect(code).toBe(1);
    expect(out).toContain(`${kb.toFixed(2)} KiB`);
    expect(out).toMatch(/over the budget/i);
  });

  it('exits 2 when the page is not in the manifest', () => {
    const { code, out } = run(DIST, '/nope/page', 100, 1);
    expect(code).toBe(2);
    expect(out).toContain('/nope/page');
  });

  it('exits 2 when there is no manifest', () => {
    const { code, out } = run(join(HERE, '__fixtures__', 'missing'), PAGE, 100, 1);
    expect(code).toBe(2);
    expect(out).toMatch(/app-build-manifest\.json/);
  });
});
