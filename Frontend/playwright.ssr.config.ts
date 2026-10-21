import { defineConfig, devices } from '@playwright/test';

import { snapshotNextEnv } from './e2e/perf-next-env';

/**
 * The server-rendered schedule — `e2e/server-render.spec.ts` only.
 *
 * A production build, because none of what it proves exists in `next dev`:
 * the page's 15 s revalidation, the cached server fetch, and its 1.2 s
 * timeout. The schedule is fetched by the Next server, out of reach of
 * `page.route()`, so the API is a real (fake) server: `e2e/helpers/fakeApi.ts`.
 *
 * Its own port and dist dir, so it never meets the functional suite's dev
 * server or a build someone else is running.
 */

// `next build` rewrites next-env.d.ts to name this dist dir; restored in teardown.
snapshotNextEnv();

// Read by the spec: outside this config (the functional suite) it skips itself.
process.env.MAISON_SSR_E2E = '1';

const PORT = 3141;
const API_PORT = 54398;
const API = `http://127.0.0.1:${API_PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /server-render\.spec\.ts/,

  // The fake API has one global mode; tests switch it, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  timeout: 60_000,

  globalTeardown: './e2e/perf-next-env.ts',

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'ssr', use: { ...devices['Pixel 7'] } }],

  webServer: [
    {
      command: 'node e2e/helpers/fakeApi.ts',
      url: `${API}/__health`,
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: `npm run build && npm run start -- --port ${PORT}`,
      port: PORT,
      // Never reuse: an existing server here would be a dev server or a stale build.
      reuseExistingServer: false,
      timeout: 600_000,
      env: {
        NEXT_DIST_DIR: '.next-ssr',
        API_URL: API,
        NEXT_PUBLIC_API_URL: API,
        NEXT_PUBLIC_DEMO_MODE: '1',
        NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
      },
    },
  ],
});
