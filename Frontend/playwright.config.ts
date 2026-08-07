import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * Runs against **demo mode**, which answers the API from fixtures. That is a
 * deliberate trade: it costs coverage of sign-in, and buys a suite that is
 * deterministic, needs no database or Supabase project, and can run in CI on
 * every push. The seam these cannot see — browser to real Postgres — is
 * covered instead by `Backend/tests/test_integration_live.py`.
 *
 * The public booking page is the exception. It calls the API directly from
 * the browser, so those specs intercept with `page.route()` and stay
 * deterministic without demo mode.
 *
 * Three viewports because the PRD's user is on a phone in a studio, and a
 * layout that only works at 1440px fails the actual use case.
 */

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,

  // A test that only passes on a retry is a flaky test, and a flaky suite
  // gets ignored. Locally it fails immediately; CI retries once to absorb
  // runner noise rather than to paper over a real race.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),

  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } },
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Fixtures rather than a live API, so the suite is hermetic.
      NEXT_PUBLIC_DEMO_MODE: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
      NEXT_PUBLIC_API_URL: `http://localhost:${PORT}/__api_not_used`,
    },
  },
});
