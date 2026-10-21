import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { COMMON_FAQ, CRAFT_GUIDES } from '../src/lib/public/craftGuide';
import { stubBookingApi, stubClass, threeCrafts } from './helpers/booking';

/**
 * The Craft Corner, in a real browser: it appears once scrolled to, teaches
 * only the crafts the studio runs, and every tap in it works by touch and by
 * keyboard. The integrator mounts it (I2); until then this spec is skipped.
 */

test.skip(!process.env.CORNER_MOUNTED, 'mounted by the integrator in I2');
test.describe.configure({ timeout: 120_000 });

const POTTERY_ONLY = [
  stubClass({ id: 'class-2', name: 'Pottery & wheel throwing', color_token: 'terra' }),
];

const OWNER_QUESTIONS = [
  ...Object.values(CRAFT_GUIDES).flatMap((guide) => guide.faq),
  ...COMMON_FAQ,
]
  .filter((entry) => !entry.a)
  .map((entry) => entry.q);

async function openCorner(page: Page, classes = threeCrafts()): Promise<Locator> {
  await stubBookingApi(page, classes);
  await page.goto('/book/maison-abeer');
  await expect(page.getByRole('heading', { name: 'Pick your class' })).toBeAttached();
  const corner = page.locator('section.corner');
  // Lazily mounted: walk down the page until it arrives.
  for (let y = 0; (await corner.count()) === 0 && y < 40_000; y += 600) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(60);
  }
  await corner.scrollIntoViewIfNeeded();
  await expect(corner).toBeVisible();
  return corner;
}

test('one craft: no tab row, tools, bring list and FAQ all work', async ({ page }) => {
  const corner = await openCorner(page, POTTERY_ONLY);
  await expect(corner.getByRole('tablist')).toHaveCount(0);
  await expect(corner.getByRole('heading', { name: 'Pottery', exact: true })).toBeVisible();
  await expect(corner.getByText('Bento cakes')).toHaveCount(0);

  const wheel = corner.getByRole('button', { name: 'Potter’s wheel' });
  await wheel.click();
  await expect(wheel).toHaveAttribute('aria-expanded', 'true');
  await expect(corner.getByText(CRAFT_GUIDES.pottery.tools[0]!.does)).toBeVisible();
  await wheel.press('Escape');
  await expect(wheel).toHaveAttribute('aria-expanded', 'false');
  await expect(corner.getByText(CRAFT_GUIDES.pottery.tools[0]!.does)).toHaveCount(0);

  const towel = corner.getByRole('checkbox', { name: 'A small towel for your hands' });
  await corner.getByText('A small towel for your hands').click();
  await expect(towel).toBeChecked();
  await towel.press('Space');
  await expect(towel).not.toBeChecked();

  const why = corner.getByRole('button', { name: 'Why is a piece not ready the same day?' });
  await why.click();
  await expect(why).toHaveAttribute('aria-expanded', 'true');
  await expect(corner.getByText(/fired in a kiln, sometimes twice/)).toBeVisible();

  for (const question of OWNER_QUESTIONS) {
    await expect(page.getByText(question, { exact: true })).toHaveCount(0);
  }
});

test('three crafts: tabs switch by tap and by arrow keys', async ({ page }) => {
  const corner = await openCorner(page);
  const tabs = corner.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(corner.getByRole('tabpanel')).toHaveAccessibleName('Pottery');
  await corner.getByRole('tab', { name: 'Painting' }).click();
  await expect(corner.getByRole('tabpanel')).toHaveAccessibleName('Painting');
  const next = corner.getByRole('button', { name: 'Another fun fact' });
  await next.click();
  await expect(corner.getByText(CRAFT_GUIDES.painting.funFacts[1]!)).toBeVisible();
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`axe clean, reduced motion ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    const corner = await openCorner(page);
    for (const name of ['Bento cakes', 'Pottery', 'Painting']) {
      await corner.getByRole('tab', { name }).click();
      await corner.getByRole('tabpanel').getByRole('button').first().click();
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page }).include('section.corner').analyze();
      expect(results.violations, name).toEqual([]);
    }
  });
}

test('every tappable thing is at least 44px', async ({ page }) => {
  const corner = await openCorner(page);
  for (const name of ['Bento cakes', 'Pottery', 'Painting']) {
    await corner.getByRole('tab', { name }).click();
    const targets = corner.locator('button, label.corner-check');
    const count = await targets.count();
    for (let i = 0; i < count; i += 1) {
      const box = await targets.nth(i).boundingBox();
      expect(box, `${name} target ${i}`).not.toBeNull();
      expect(box!.height, `${name} target ${i}`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${name} target ${i}`).toBeGreaterThanOrEqual(44);
    }
  }
});

for (const width of [320, 375]) {
  test(`no sideways scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const corner = await openCorner(page);
    for (const name of ['Bento cakes', 'Pottery', 'Painting']) {
      await corner.getByRole('tab', { name }).click();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, name).toBeLessThanOrEqual(0);
    }
  });
}

test('screenshots of each corner', async ({ page }, testInfo) => {
  const dir = process.env.CORNER_SHOTS;
  test.skip(!dir, 'set CORNER_SHOTS to a folder to keep screenshots');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const corner = await openCorner(page);
  for (const name of ['Bento cakes', 'Pottery', 'Painting']) {
    await corner.getByRole('tab', { name }).click();
    await corner.getByRole('tabpanel').getByRole('button').first().click();
    await corner.screenshot({
      path: `${dir}/corner-${testInfo.project.name}-${name.split(' ')[0]!.toLowerCase()}.png`,
    });
  }
});
