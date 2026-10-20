import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Save and restore `next-env.d.ts` around a perf run.
 *
 * `next build` rewrites that file's typed-routes reference to point at
 * whatever `NEXT_DIST_DIR` was set to. The perf suite builds into
 * `.next-perf`, so without this a single run leaves the committed file
 * naming `./.next-perf/types/routes.d.ts` — a path nothing else in the repo
 * creates, so `npm run typecheck` then fails for the next person until they
 * notice a file the file itself says not to edit has changed under them.
 *
 * Two things about the mechanics are load-bearing:
 *
 * **The snapshot cannot be taken in `globalSetup`.** Playwright assembles
 * its startup tasks as `[remove output dirs, plugin setup, global teardowns,
 * global setups]` (`playwright/lib/runner/index.js`,
 * `createGlobalSetupTasks`) and the `webServer` is a plugin — so by the time
 * `globalSetup` runs, `next build` has already rewritten the file and a copy
 * taken there would faithfully preserve the damage. Config evaluation is the
 * only hook that runs before the build, which is why
 * `playwright.perf.config.ts` calls `snapshotNextEnv()` at module scope.
 *
 * **The restore is a `globalTeardown`, not `git checkout --` chained into
 * the npm script.** A checkout throws away unrelated edits to that path, and
 * anything `&&`-ed after `playwright test` never runs at all when you
 * Ctrl-C the run — which, given a perf suite that takes minutes, is exactly
 * how this gets hit. Playwright runs its task cleanups on SIGINT, so a
 * teardown does fire there.
 */

const NEXT_ENV = path.resolve(__dirname, '..', 'next-env.d.ts');

/** The dist dir playwright.perf.config.ts builds into. */
const PERF_DIST_DIR = '.next-perf';

/**
 * Keyed by the absolute path, not a fixed name: two checkouts of this repo
 * on one machine must not restore each other's bytes.
 */
function stashPath(): string {
  const key = createHash('sha1').update(NEXT_ENV).digest('hex').slice(0, 12);
  return path.join(tmpdir(), `maison-abeer-next-env-${key}.snapshot`);
}

/** Has `next build --dist-dir .next-perf` already been through this file? */
function alreadyRewritten(bytes: Buffer): boolean {
  return bytes.includes(PERF_DIST_DIR);
}

/**
 * First write wins, and a rewritten file is never stashed.
 *
 * Both guards are for the same discovery: Playwright evaluates the config
 * **more than once** — in the runner before anything starts, and again in
 * each worker process, which spawns *after* the webServer has finished
 * building. Without them the worker's evaluation overwrote the good snapshot
 * with the rewritten one and the teardown faithfully restored the damage.
 * (Found by reading the stash after the first real run of this suite, not by
 * reasoning about it.)
 */
export function snapshotNextEnv(): void {
  if (!existsSync(NEXT_ENV)) return;
  if (existsSync(stashPath())) return;

  const bytes = readFileSync(NEXT_ENV);
  if (alreadyRewritten(bytes)) return;

  writeFileSync(stashPath(), bytes);
}

export default function restoreNextEnv(): void {
  const stash = stashPath();
  if (!existsSync(stash)) return;

  const saved = readFileSync(stash);

  // Belt and braces against the double-evaluation above: restoring a
  // snapshot that itself names the perf dist dir would write the damage back
  // in and look like it had worked.
  if (alreadyRewritten(saved)) {
    rmSync(stash, { force: true });
    return;
  }

  // Only when the build actually moved it. Writing unconditionally would
  // bump the mtime on every run and wake every watcher pointed at a file
  // whose contents did not change.
  if (!existsSync(NEXT_ENV) || !readFileSync(NEXT_ENV).equals(saved)) {
    writeFileSync(NEXT_ENV, saved);
  }

  rmSync(stash, { force: true });
}
