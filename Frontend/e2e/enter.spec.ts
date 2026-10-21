import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The recovery link page, `/enter`.
 *
 * Reached by a guest who has lost their session, from a link the host sent.
 * Demo mode does not cover sign-in, so these intercept the network instead.
 *
 * The page has two failure states. "Used" is what a link that cannot be
 * redeemed reads as. "Our side" is what a throw before or during the redeem
 * reads as; in a browser the reliable way to produce one is to fail the
 * chunk that carries the Supabase client (`next dev` names it after its
 * source path).
 */

const VERIFY = '**/auth/v1/verify**';
const CLIENT_CHUNK = /supabase_client/;

async function failTheClientChunk(page: Page) {
  await page.route(CLIENT_CHUNK, (route) => route.abort());
}

/** The page's own alert, not Next's empty route announcer. */
function alert(page: Page) {
  return page.locator('main').getByRole('alert');
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
}

async function shoot(page: Page, name: string) {
  const dir = process.env['ENTER_SHOTS'];
  if (!dir) return;
  // The sticker draws itself on; photograph the finished drawing.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: `${dir}/enter-${name}-${width}.png`, fullPage: true });
}

test.describe('/enter', () => {
  test('no token reads as a used link, with nothing to retry', async ({ page }) => {
    await page.goto('/enter');

    await expect(alert(page)).toHaveText('That link has already been used');
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await shoot(page, 'spent');
  });

  test('a throw reads as our side, with Try again', async ({ page }) => {
    await failTheClientChunk(page);

    await page.goto('/enter?token=x');

    await expect(alert(page)).toHaveText(/We couldn.t sign you in just now/);
    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible();
    expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    // The token left the address bar before anything touched the network.
    await expect(page).toHaveURL(/\/enter$/);
    await expectNoSidewaysScroll(page);
    await shoot(page, 'broken');
  });

  /*
   * Known gap, outside this unit: `redeemPortalToken` returns false for every
   * auth error, and supabase-js reports a 500 from verify as an error rather
   * than throwing, so a server failure reads as "already used". Marked as an
   * expected failure so the day it is fixed, this test says so.
   */
  test('a 500 from verify reads as our side', async ({ page }) => {
    test.fail();

    await page.route(VERIFY, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'server error' }),
      }),
    );

    await page.goto('/enter?token=x');

    await expect(alert(page)).toHaveText(/We couldn.t sign you in just now/, { timeout: 4000 });
  });

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`both failure states are axe clean (${reducedMotion})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });

      await page.goto('/enter');
      await expect(alert(page)).toBeVisible();
      await expectAxeClean(page);

      await failTheClientChunk(page);
      await page.goto('/enter?token=x');
      await expect(alert(page)).toHaveText(/We couldn.t sign you in just now/);
      await expectAxeClean(page);
    });
  }
});
