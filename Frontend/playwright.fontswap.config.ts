import { defineConfig, devices } from '@playwright/test';

import { snapshotNextEnv } from './e2e/perf-next-env';

/**
 * The font-swap check: `e2e/font-swap.spec.ts` only.
 *
 * Modelled on `playwright.lab.config.ts`: a production build served by
 * `next start` on a Pixel 7 profile, throttled over CDP by the spec. Its own
 * port, API port and dist dir (3144, 54400, `.next-fontswap`), so it never
 * meets the lab, the server-render suite or the functional suite.
 */

// `next build` rewrites next-env.d.ts to name this dist dir; restored in teardown.
snapshotNextEnv();

// Read by the spec: outside this config (the functional suite) it skips itself.
process.env.MAISON_FONTSWAP_E2E = '1';

const PORT = 3144;
const API = 'http://127.0.0.1:54400';

export default defineConfig({
  testDir: './e2e',
  testMatch: /font-swap\.spec\.ts/,

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
      name: 'fontswap',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 412, height: 823 },
        deviceScaleFactor: 2.6,
      },
    },
  ],

  webServer: [
    {
      command: 'node e2e/helpers/fontSwapApi.ts',
      url: `${API}/__health`,
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: `npm run build && npm run start -- --port ${PORT}`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 600_000,
      env: {
        NEXT_DIST_DIR: '.next-fontswap',
        API_URL: API,
        NEXT_PUBLIC_API_URL: API,
        NEXT_PUBLIC_DEMO_MODE: '1',
        NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
      },
    },
  ],
});
