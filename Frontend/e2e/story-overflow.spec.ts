import { expect, test } from '@playwright/test';

import { stubClass } from './helpers/booking';

/**
 * A studio story must never scroll the phone sideways.
 *
 * The story section draws a decorative pattern wider than itself. The live
 * studio has no story and the other specs' fixtures never set one, so the
 * no-sideways-scroll guard had never seen this branch — and it failed: with a
 * story the page measured 468px wide at 375px.
 */

const STORY = 'A small studio above the bakery, where Saturday mornings smell of clay and sugar.';

test('phone: a studio story does not widen the page', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'the phone is where this bit');

  await page.route('**/api/v1/public/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer', story: STORY },
        classes: [stubClass()],
      }),
    }),
  );

  await page.goto('/book/maison-abeer');
  await expect(page.getByText(STORY)).toBeAttached();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(500);

  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));

  expect(widths.scroll).toBe(widths.client);
});
