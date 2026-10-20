import { defineConfig } from '@playwright/test';

import { snapshotNextEnv } from './e2e/perf-next-env';

/**
 * The hero performance suite — `e2e/hero-perf.spec.ts` only.
 *
 * Separate from `playwright.config.ts` because almost nothing it needs is
 * what the functional suite needs: a **production** build rather than
 * `next dev`, one worker rather than full parallelism, and minutes rather
 * than seconds of patience. See ADR 0004 for what the spec measures and why
 * this is deliberately not part of `npm run test:e2e`.
 *
 * It is also not in the default gate because `next build` fetches the
 * Google Fonts next/font pulls in at build time, so this run needs network
 * where the rest of the suite does not.
 */

// `next build` rewrites next-env.d.ts to name this config's dist dir. The
// snapshot has to happen here, at config evaluation — globalSetup runs
// *after* the webServer plugin, i.e. after the build. See e2e/perf-next-env.ts.
snapshotNextEnv();

// Not 3100. The functional suite's dev server lives there and may well be
// running; a perf build that bound the same port would either fail to start
// or, worse, find that dev server already listening and silently measure it.
const PORT = 3111;

export default defineConfig({
  testDir: './e2e',

  /*
   * One spec, named explicitly.
   *
   * `testDir` is the functional suite's directory, so without this the perf
   * run would stand up a production build and then walk all seven functional
   * specs through it at 6x CPU with a single worker. The other half of this
   * is `testIgnore` in playwright.config.ts, which keeps the reverse from
   * happening.
   */
  testMatch: /hero-perf\.spec\.ts/,

  /*
   * Load-bearing, not tidiness.
   *
   * Every assertion in the spec is a ratio between two arms measured in the
   * same test on the same machine — absolute milliseconds are not
   * transferable to another runner. A second worker executing on another
   * core changes the effective CPU throttle rate the arms are being compared
   * under, which is the one thing the ratio assumes is held constant.
   */
  fullyParallel: false,
  workers: 1,

  // No retries. A perf measurement that only separates on the second attempt
  // has not separated.
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],

  // Up to four page loads per test, each a production bundle fetched over an
  // emulated 4G link and executed on a main thread slowed 6x, plus a 2.5s
  // frame window on each.
  timeout: 300_000,

  globalTeardown: './e2e/perf-next-env.ts',

  use: {
    baseURL: `http://localhost:${PORT}`,
    // Tracing instruments the page. Here that is not overhead to be tidy
    // about, it is the measurement being changed by observing it.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },

  /*
   * One project, and no device options.
   *
   * The spec builds a context per arm with `browser.newContext()`, because
   * the arms differ by `reducedMotion` and by their init scripts and a
   * context cannot be re-pointed after it exists. `newContext` does not
   * inherit a project's `use`, so declaring the device here would be a
   * second, silently ignored copy of it. The spec owns it instead.
   */
  projects: [{ name: 'perf' }],

  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    port: PORT,

    /*
     * Never reuse. On this config "an existing server" means a dev server or
     * a stale build, and measuring either produces a number that looks like
     * a result. The author's first run of this suite hit exactly that: a dev
     * server answered, the hero's chunk never finished loading inside the
     * window, and the full arm recorded zero draws and zero dropped frames.
     */
    reuseExistingServer: false,

    // `next build`, not a dev server boot. Playwright's default of 60s
    // cannot cover it, and when it expires the failure reads "the server
    // never came up" rather than "the build is still running".
    timeout: 600_000,

    env: {
      // Its own build directory, for the reason next.config.ts gives: a
      // build that writes into `.next` corrupts it underneath a live dev
      // server, and the symptom presents as a hydration bug.
      NEXT_DIST_DIR: '.next-perf',

      // Identical to playwright.config.ts on purpose. The public booking
      // page talks to the API from the browser whatever this is set to — the
      // spec intercepts with `page.route()` — and leaving it matching keeps
      // the only differences between the two configs the ones this file is
      // for: production build, port, dist dir.
      NEXT_PUBLIC_DEMO_MODE: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',

      // This config's own port, not 3100. If a route pattern in the spec
      // ever stops matching, the request must fail against a port nothing is
      // serving rather than reach a real dev server and quietly make the
      // measurement depend on it.
      NEXT_PUBLIC_API_URL: `http://localhost:${PORT}/__api_not_used`,
    },
  },
});
