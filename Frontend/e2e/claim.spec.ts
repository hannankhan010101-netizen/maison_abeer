import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The guest portal explains itself when the sign-in matches no booking, and
 * when the check itself fails.
 *
 * The suite runs in demo mode, where the claim endpoint is answered in the
 * browser by `lib/demo/transport.ts`; the `ma-demo-claim` cookie picks the
 * answer. That switch is honoured only in demo mode.
 */

const COOKIE = 'ma-demo-claim';
const SHOTS = process.env['CLAIM_SHOTS_DIR'];

async function scenario(page: Page, value: 'unmatched' | 'error') {
  const baseURL = test.info().project.use.baseURL ?? '';
  await page.context().addCookies([{ name: COOKIE, value, url: baseURL }]);
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
}

test.describe('the claim notice', () => {
  test('explains an account that matches no booking', async ({ page }, testInfo) => {
    await scenario(page, 'unmatched');
    await page.goto('/portal');

    const notice = page.getByRole('status').filter({ hasText: 'Use the email you booked with' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("We couldn't find a booking for that email.");
    await expect(notice).toContainText(
      'Use the email you booked with, or ask your studio to resend your link',
    );

    // Below the header, inside the guest container.
    const header = await page.locator('header').first().boundingBox();
    const box = await notice.boundingBox();
    expect(header && box && box.y >= header.y + header.height).toBe(true);

    await noSidewaysScroll(page);
    await axeClean(page);

    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/claim-unmatched-${testInfo.project.name}.png` });
    }
  });

  test('stays hidden once the account is matched', async ({ page }) => {
    await page.goto('/portal');

    // The list loads, which means the claim has settled too.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('Use the email you booked with')).toHaveCount(0);
    await expect(page.getByText("We couldn't check your bookings just now")).toHaveCount(0);
  });

  test('says so when the check fails, and Try again recovers', async ({ page }, testInfo) => {
    await scenario(page, 'error');
    await page.goto('/portal');

    const alert = page.getByRole('alert').filter({ hasText: "We couldn't check your bookings" });
    await expect(alert).toBeVisible();
    await noSidewaysScroll(page);
    await axeClean(page);

    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/claim-error-${testInfo.project.name}.png` });
    }

    // The check works again; the button asks once more and the alert goes.
    await page.context().clearCookies({ name: COOKIE });
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(alert).toHaveCount(0);
  });
});
