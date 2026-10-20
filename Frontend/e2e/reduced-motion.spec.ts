import { expect, test, type Page } from '@playwright/test';

import { stubBookingApi, threeCrafts } from './helpers/booking';

/**
 * A guest who asks for reduced motion gets a still page.
 *
 * This is a guard for everything built on top of the storefront, not for any
 * one effect: whatever a later unit adds — a marquee, a morph, a scrub, a
 * confetti burst — has to leave nothing running once the page has settled. Two
 * independent things can run, and both are measured:
 *
 * - **CSS animations**, which the global `prefers-reduced-motion` rule collapses
 *   to a single 0.01ms iteration. After the page settles none may still be
 *   `running`.
 * - **JavaScript frame loops** (a cursor, a particle field, a smooth-scroll
 *   driver). CSS cannot stop those; each has to check the preference itself. An
 *   idle page should ask for no more than a couple of animation frames a
 *   second.
 *
 * The twin test runs the same page with motion allowed and expects the opposite,
 * so a guard that has quietly stopped seeing anything cannot pass for the real
 * thing.
 */

interface Running {
  tag: string;
  animation: string;
}

/** Count `requestAnimationFrame` calls from before the page's own scripts run. */
async function countFrames(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number };
    w.__frames = 0;
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      w.__frames += 1;
      return original(callback);
    };
  });
}

/** Load the page and scroll all the way down, so every reveal has fired. */
async function loadAndScrollThrough(page: Page) {
  await page.goto('/book/maison-abeer');
  await expect(page.getByRole('heading', { name: 'Pick your class' })).toBeAttached();

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 500) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
}

async function running(page: Page): Promise<Running[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target as Element | null;
        return {
          tag: `${target?.tagName ?? '?'}.${String(target?.className ?? '').slice(0, 50)}`,
          animation: (animation as CSSAnimation).animationName ?? animation.constructor.name,
        };
      }),
  );
}

async function idleFrames(page: Page): Promise<number> {
  const before = await page.evaluate(() => (window as unknown as { __frames: number }).__frames);
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => (window as unknown as { __frames: number }).__frames);
  return after - before;
}

test('with reduced motion nothing on the storefront is animating once it has settled', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await countFrames(page);
  await stubBookingApi(page, threeCrafts());

  await loadAndScrollThrough(page);

  const stillRunning = await running(page);
  expect(stillRunning, JSON.stringify(stillRunning, null, 2)).toEqual([]);

  const frames = await idleFrames(page);
  expect(frames, `${frames} animation frames requested in one idle second`).toBeLessThanOrEqual(2);
});

test('with motion allowed the same page does animate — so the guard above can see it', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await countFrames(page);
  await stubBookingApi(page, threeCrafts());

  await loadAndScrollThrough(page);

  expect((await running(page)).length).toBeGreaterThan(0);
});
