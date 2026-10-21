import { expect, test, type Page } from '@playwright/test';

import { stubBookingApi, threeCrafts } from './helpers/booking';

/**
 * The storefront's atmosphere, measured in a real browser: scroll-driven
 * reveals, stacking chapters, the phone bar.
 *
 * jsdom cannot run any of this, so the unit tests only pin the wiring.
 */

test.describe.configure({ timeout: 120_000 });

async function open(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await stubBookingApi(page, threeCrafts());
  await page.goto('/book/maison-abeer');
  await expect(page.getByRole('heading', { name: 'Pick your kind of mess' })).toBeAttached();
}

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 375, height: 812 };

test('desktop: chapter text reveals with the scroll itself, with no script involved', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page, DESKTOP);

  const supported = await page.evaluate(() => CSS.supports('animation-timeline: view()'));
  test.skip(!supported, 'this browser has no scroll-driven animations');

  const top = await page.evaluate(() => {
    const text = document.querySelector('.chapter-text')!;
    return text.getBoundingClientRect().top + window.scrollY;
  });
  const opacityAt = async (scrollY: number) => {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(300);
    return page.evaluate(() =>
      Number(getComputedStyle(document.querySelector('.chapter-text')!).opacity),
    );
  };

  // The text's top edge is just inside the bottom of the window, then well up it.
  const entering = await opacityAt(top - DESKTOP.height + 40);
  const settled = await opacityAt(top - DESKTOP.height / 3);

  expect(entering).toBeLessThan(0.5);
  expect(settled).toBe(1);

  // And the animation really is the browser's, not a transition from a class.
  const timeline = await page.evaluate(() => {
    const animation = document.querySelector('.chapter-text')!.getAnimations()[0];
    return animation?.timeline?.constructor.name ?? null;
  });
  expect(timeline).toBe('ViewTimeline');
});

test('with reduced motion the chapter text is simply visible and nothing runs', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, DESKTOP);

  const state = await page.evaluate(() =>
    [...document.querySelectorAll('.chapter-text')].map((node) => ({
      opacity: getComputedStyle(node).opacity,
      animations: node.getAnimations().length,
    })),
  );
  expect(state).toHaveLength(3);
  for (const item of state) {
    expect(item.opacity).toBe('1');
    expect(item.animations).toBe(0);
  }
});

test('chapters stack (sticky) from 768px and flow normally below it', async ({ page }) => {
  await open(page, { width: 1024, height: 900 });
  const positions = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('article.chapter')].map((n) => getComputedStyle(n).position),
    );
  expect(await positions()).toEqual(['sticky', 'sticky', 'sticky']);

  await page.setViewportSize({ width: 767, height: 900 });
  expect(await positions()).toEqual(['static', 'static', 'static']);

  // A window too short to hold a chapter falls back to flow rather than trapping it.
  await page.setViewportSize({ width: 1024, height: 600 });
  expect(await positions()).toEqual(['static', 'static', 'static']);
});

for (const [name, size] of [
  ['desktop', DESKTOP],
  ['phone', PHONE],
] as const) {
  test(`${name}: nothing covers a chapter's "Save a seat" link once it is scrolled to`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page, size);

    const count = await page.locator('article.chapter').count();
    expect(count).toBe(3);

    for (let index = 0; index < count; index += 1) {
      const link = page
        .locator('article.chapter')
        .nth(index)
        .getByRole('link', {
          name: /Save a seat/,
        });
      // Scroll again on every poll: lazy photos above can still be growing the
      // page, which moves the link after the first scroll has landed.
      await expect
        .poll(() =>
          link.evaluate((node) => {
            node.scrollIntoView({ block: 'center' });
            const { top } = node.getBoundingClientRect();
            return top > 0 && top < innerHeight;
          }),
        )
        .toBe(true);
      await page.waitForTimeout(400);

      const hit = await link.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const found = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return found === node || node.contains(found)
          ? 'ok'
          : `${found?.outerHTML.slice(0, 160)} @ ${box.top}/${innerHeight}`;
      });
      expect(hit, `chapter ${index}'s link is covered`).toBe('ok');
    }
  });
}

test('phone: the Save a seat bar appears after the hero and gives way to the booking card', async ({
  page,
}) => {
  await open(page, PHONE);
  const bar = page.locator('[data-sticky-cta]');

  await expect(bar).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.y + box.height).toBeCloseTo(PHONE.height, 0);

  await page.evaluate(() => document.getElementById('booking-widget')!.scrollIntoView());
  await expect(bar).toHaveCount(0);
});

test('desktop: the bar is never shown', async ({ page }) => {
  await open(page, DESKTOP);
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
  await page.waitForTimeout(300);
  await expect(page.locator('[data-sticky-cta]')).toBeHidden();
});

test('phone: nothing scrolls sideways at 375px', async ({ page }) => {
  await open(page, PHONE);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 500) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `sideways overflow at ${y}px`).toBeLessThanOrEqual(0);
  }
});
