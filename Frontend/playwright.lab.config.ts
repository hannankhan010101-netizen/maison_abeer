import { defineConfig, devices } from '@playwright/test';

import { snapshotNextEnv } from './e2e/perf-next-env';

/**
 * The lab: `e2e/perf-lab.spec.ts` only.
 *
 * A production build served by `next start`, loaded on a Moto G-class phone
 * over Slow 4G with the CPU slowed 4x (the spec applies both over CDP). The
 * schedule comes from a fake API (`e2e/helpers/labApi.ts`) because the page
 * fetches it on the server, out of reach of `page.route()`.
 *
 * Its own port, API port and dist dir (3142, 54399, `.next-lab`), so it never
 * meets the functional suite's dev server or the server-render suite.
 */

// `next build` rewrites next-env.d.ts to name this dist dir; restored in teardown.
snapshotNextEnv();

// Read by the spec: outside this config (the functional suite) it skips itself.
process.env.MAISON_LAB_E2E = '1';

const PORT = 3142;
const API = 'http://127.0.0.1:54399';

export default defineConfig({
  testDir: './e2e',
  testMatch: /perf-lab\.spec\.ts/,

  // Numbers taken while another test shares the CPU mean nothing.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  timeout: 120_000,

  globalTeardown: './e2e/perf-next-env.ts',

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'lab',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 412, height: 823 },
        deviceScaleFactor: 2.6,
      },
    },
  ],

  webServer: [
    {
      command: 'node e2e/helpers/labApi.ts',
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
        NEXT_DIST_DIR: '.next-lab',
        API_URL: API,
        NEXT_PUBLIC_API_URL: API,
        NEXT_PUBLIC_DEMO_MODE: '1',
        NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
      },
    },
  ],
});
