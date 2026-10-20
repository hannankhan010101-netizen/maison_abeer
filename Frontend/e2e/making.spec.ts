import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { stubBookingApi, threeCrafts } from './helpers/booking';

/**
 * "The making of" scroll story.
 *
 * The section must tell the whole craft whatever the guest's settings, pin only
 * where pinning helps, and never bring the 3D library back onto the page.
 */

test.describe.configure({ timeout: 120_000 });

async function open(page: Page) {
  await stubBookingApi(page, threeCrafts());
  await page.goto('/book/maison-abeer');
  await expect(page.getByRole('heading', { name: 'Pick your class' })).toBeAttached();
}

async function scrollWholePage(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 400) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(40);
  }
}

test('scrolling the whole page never loads three', async ({ page }) => {
  await open(page);
  await scrollWholePage(page);
  expect(await page.evaluate(() => '__THREE__' in window)).toBe(false);
});

test('all four stages are on the page, captioned', async ({ page }) => {
  await open(page);
  for (const caption of [
    'A lump of clay',
    'Centred on the wheel',
    'Opened up',
    'Pulled into shape',
  ]) {
    await expect(page.getByText(caption, { exact: true }).first()).toBeAttached();
  }
});

test('desktop: scrolling through the section ends on the vase, with no sideways scroll', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'pinning only happens from 768px up');
  await open(page);

  const section = page.locator('section.making');
  await expect(section).toHaveAttribute('data-pinned', '', { timeout: 20_000 });

  const start = await section.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const viewport = page.viewportSize()!.height;
  // 250% of the viewport is the scrubbed distance; stop just short of its end.
  const target = start + viewport * 2.45;
  for (let y = start; y <= target; y += 150) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(30);
  }
  await page.evaluate((to) => window.scrollTo(0, to), target);

  await expect(page.locator('.making__stage-caption')).toHaveText('Pulled into shape');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('with reduced motion there is no pin and no pin spacer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await scrollWholePage(page);

  await expect(page.locator('[data-pinned]')).toHaveCount(0);
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
  await expect(page.locator('.making__stage')).toHaveCount(0);
  await expect(page.getByText('Pulled into shape', { exact: true })).toBeVisible();
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`the storefront passes axe (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await open(page);
    await scrollWholePage(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const summary = results.violations.map((v) => ({
      rule: v.id,
      nodes: v.nodes.map((n) => n.html.slice(0, 160)),
    }));
    expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
  });
}
