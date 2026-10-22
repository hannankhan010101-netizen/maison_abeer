import { expect, test } from '@playwright/test';

import { stubBookingApi, threeCrafts } from './helpers/booking';

/**
 * The booking page does not jump.
 *
 * It fetches its classes in the browser, so for a moment it is only a loading
 * placeholder. If that placeholder is the booking card sitting at the top of the
 * page, then when the data arrives the hero and every section render *above* it
 * and push it thousands of pixels down — one enormous layout shift on the page an
 * advert links to (measured at 0.29; Google calls anything over 0.25 poor and
 * wants under 0.1). The loading state therefore has to be a placeholder that is
 * *replaced* by the page, not one the page is built on top of.
 *
 * Measured the way the browser reports it: `layout-shift` entries with no recent
 * input, summed across the load and a scroll through the whole page, so a late
 * shift (a scroll story's spacer, an image with no reserved size) counts too.
 */

const BUDGET = 0.1;

test('the booking page does not shift while it loads or scrolls', async ({ page }) => {
  // It settles, then reads down a page that now fetches its sections' code as it goes: allow for a cold dev server.
  test.slow();
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number; __shifts: unknown[] };
    w.__cls = 0;
    w.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
        startTime: number;
        sources?: { node?: Node | null }[];
      }[]) {
        if (entry.hadRecentInput) continue;
        w.__cls += entry.value;
        const node = entry.sources?.[0]?.node as Element | undefined;
        w.__shifts.push({
          value: Math.round(entry.value * 1000) / 1000,
          at: Math.round(entry.startTime),
          node: node ? `${node.nodeName}.${String(node.className ?? '').slice(0, 40)}` : '?',
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await stubBookingApi(page, threeCrafts());

  await page.goto('/book/maison-abeer');
  await expect(page.getByRole('heading', { name: 'Pick your class' })).toBeAttached();

  // A visitor lets the page settle before reading down it; the sections' code is fetched in
  // idle time, so by the time the network is quiet it is ready and nothing pops in on screen.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.waitForLoadState('networkidle');

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 300) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);

  const { cls, shifts } = await page.evaluate(() => {
    const w = window as unknown as { __cls: number; __shifts: unknown[] };
    return { cls: Math.round(w.__cls * 1000) / 1000, shifts: w.__shifts };
  });

  expect(cls, `layout shift ${cls}: ${JSON.stringify(shifts)}`).toBeLessThan(BUDGET);
});
