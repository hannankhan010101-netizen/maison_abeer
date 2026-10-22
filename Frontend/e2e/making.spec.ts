import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { stubBookingApi, threeCrafts } from './helpers/booking';
import { loadAllSections } from './helpers/lazy';

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
  await loadAllSections(page);
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
  // One viewport (PIN_DISTANCE) is the scrubbed distance; stop just short of its end.
  const target = start + viewport * 0.97;
  for (let y = start; y <= target; y += 100) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(30);
  }
  await page.evaluate((to) => window.scrollTo(0, to), target);

  await expect(page.locator('.making-beats li[aria-current="step"]')).toHaveText(
    'Pulled into shape',
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('desktop: the story takes at most two screens of scroll', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'pinning only happens from 768px up');
  await open(page);

  await expect(page.locator('section.making')).toHaveAttribute('data-pinned', '', {
    timeout: 20_000,
  });
  const spacer = page.locator('.pin-spacer:has(> section.making)');
  await expect(spacer).toHaveCount(1);
  const height = await spacer.evaluate((el) => el.getBoundingClientRect().height);
  const viewport = page.viewportSize()!.height;
  expect(height).toBeLessThanOrEqual(2.1 * viewport);
});

test('desktop: the story reserves its scroll, so the next section never slides over it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'pinning only happens from 768px up');
  await open(page);

  await expect(page.locator('section.making')).toHaveAttribute('data-pinned', '', {
    timeout: 20_000,
  });
  const spacer = page.locator('.pin-spacer:has(> section.making)');
  await expect(spacer).toHaveCount(1);

  const box = await spacer.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const section = el.querySelector('section.making')!.getBoundingClientRect();
    // What follows the pinned scene: the next island, or the footer. (The booking card
    // now sits above it, under the hero, so it is no longer what could slide over it.)
    const island = el.closest('[data-lazy-section]') ?? el;
    const next = island.nextElementSibling ?? document.querySelector('footer')!;
    const nextRect = next.getBoundingClientRect();
    return {
      spacerTop: rect.top + window.scrollY,
      spacerBottom: rect.bottom + window.scrollY,
      sectionHeight: section.height,
      nextTop: nextRect.top + window.scrollY,
    };
  });
  const viewport = page.viewportSize()!.height;

  // GSAP pads the spacer by the pin distance (one viewport) so what follows is
  // pushed down. Inside a flex parent it silently stops doing that, and the
  // next section scrolled straight over the clay — this is the guard for it.
  expect(box.spacerBottom - box.spacerTop).toBeGreaterThanOrEqual(
    box.sectionHeight + 0.9 * viewport,
  );
  expect(box.nextTop).toBeGreaterThanOrEqual(box.spacerBottom);
});

test('hands are present in every frame', async ({ page }) => {
  await open(page);
  const frames = page.locator('section.making figure');
  await expect(frames).toHaveCount(4);
  for (let i = 0; i < 4; i += 1) {
    const hands = frames.nth(i).locator('[data-making-hands] path[data-making-hand]');
    await expect(hands).toHaveCount(2);
    const d = await hands.evaluateAll((paths) => paths.map((p) => p.getAttribute('d') ?? ''));
    for (const path of d) expect(path).toMatch(/^M/);
  }
});

test('with reduced motion there is no pin and no pin spacer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await scrollWholePage(page);

  await expect(page.locator('[data-pinned]')).toHaveCount(0);
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
  await expect(page.locator('.making__stage')).toHaveCount(0);
  await expect(page.locator('section.making figure')).toHaveCount(4);
  await expect(page.locator('figcaption', { hasText: 'Pulled into shape' })).toBeVisible();
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
