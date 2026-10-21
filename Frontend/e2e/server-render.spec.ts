import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * `/book/[slug]` on a production build: the schedule is in the first HTML,
 * a slow or failing API never holds the page up, and a stale seat count is
 * corrected in place without moving anything.
 *
 * Runs only under `playwright.ssr.config.ts` (`npm run test:e2e:ssr`), which
 * builds the app and starts `e2e/helpers/fakeApi.ts`.
 */

test.skip(!process.env.MAISON_SSR_E2E, 'production-build spec: npm run test:e2e:ssr');

const API = 'http://127.0.0.1:54398';
const CLASS = 'Bento cake decorating';
const CAFE = 'Bloom Café, Gulberg';

// A slug no earlier test or run has rendered, so the page's 15 s cache is cold.
let counter = 0;
function freshSlug(): string {
  counter += 1;
  return `ssr-${Date.now().toString(36)}-${counter}`;
}

async function mode(request: APIRequestContext, name: string) {
  const response = await request.post(`${API}/__mode/${name}`);
  expect(response.ok()).toBe(true);
}

async function watchLayoutShift(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!entry.hadRecentInput) w.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

test.afterEach(async ({ request }) => mode(request, 'ok'));

test('the first HTML carries the schedule, with JavaScript off', async ({ browser, request }) => {
  await mode(request, 'ok');
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  const response = await page.goto(`/book/${freshSlug()}`);
  expect(response?.status()).toBe(200);

  const html = await page.content();
  expect(html).toContain(CLASS);
  expect(html).toContain(CAFE);
  expect(html).toContain('8 seats left');
  await context.close();
});

test('a slow API does not hold the page up; the browser fetch fills it in', async ({
  page,
  request,
}) => {
  await mode(request, 'slow');
  const slug = freshSlug();

  const started = Date.now();
  const response = await request.get(`/book/${slug}`);
  const elapsed = Date.now() - started;
  expect(response.status()).toBe(200);
  expect(elapsed).toBeLessThan(2000);
  expect(await response.text()).not.toContain(CLASS);

  await page.goto(`/book/${slug}`);
  await expect(page.getByText(CLASS).first()).toBeVisible({ timeout: 15_000 });
});

test('a failing API shows the shell, then the existing error alert', async ({ page, request }) => {
  await mode(request, 'error');

  const response = await page.goto(`/book/${freshSlug()}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('alert')).toBeVisible();
});

test('a stale seat count is corrected in place, with no layout shift', async ({
  page,
  request,
}) => {
  await mode(request, 'different-seats');
  const slug = freshSlug();
  await watchLayoutShift(page);

  const response = await page.goto(`/book/${slug}`);
  expect(await response?.text()).toContain('8 seats left');

  await expect(page.getByText('Only 2 seats left')).toBeVisible();
  await expect(page.getByText('8 seats left', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(800);

  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls).toBeLessThan(0.05);
});
