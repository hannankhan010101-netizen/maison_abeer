import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { guideFor } from '../src/lib/public/craftGuide';

import { stubBookingApi, stubClass, threeCrafts } from './helpers/booking';

/**
 * The cast in the hero: a tap pops a fact, the keyboard works, reduced motion
 * is still, nothing shifts, and every character is a 44px target.
 */

const CAST = '.character-cast';
const bento = (page: Page) => page.getByRole('button', { name: 'Bento, tap for a cake fact' });
const pip = (page: Page) => page.getByRole('button', { name: 'Pip, tap for a clay fact' });
const speechOf = (page: Page, craft: string) =>
  page.locator(`.character-slot[data-craft="${craft}"] .character-speech`);

async function open(page: Page, classes = threeCrafts()) {
  await stubBookingApi(page, classes);
  await page.goto('/book/maison-abeer');
  await expect(page.getByRole('heading', { level: 1, name: 'Maison Abeer' })).toBeVisible();
}

test('one character per craft taught, and only those', async ({ page }) => {
  await open(page, [stubClass({ color_token: 'terra' })]);
  await expect(page.locator(`${CAST} button`)).toHaveCount(1);
  await expect(pip(page)).toBeVisible();
});

test('a tap pops the next fun fact, cycling', async ({ page }) => {
  await open(page);
  const facts = guideFor('cake').funFacts;
  await bento(page).click();
  await expect(speechOf(page, 'cake')).toHaveText(facts[0]!);
  await expect(speechOf(page, 'cake')).toBeVisible();
  await bento(page).click();
  await expect(speechOf(page, 'cake')).toHaveText(facts[1]!);
});

test('Enter and Space work from the keyboard', async ({ page }) => {
  await open(page);
  const facts = guideFor('pottery').funFacts;
  await pip(page).focus();
  await page.keyboard.press('Enter');
  await expect(speechOf(page, 'pottery')).toHaveText(facts[0]!);
  await page.keyboard.press('Space');
  await expect(speechOf(page, 'pottery')).toHaveText(facts[1]!);
});

test('with reduced motion the cast is still, and still answers', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.waitForTimeout(500);
  // Names, not a count, so a failure says what is moving. Polled: a hover or
  // focus change may start a near-instant transition that is gone a frame later.
  const running = () =>
    page.evaluate(
      (selector) =>
        document
          .querySelector(selector)!
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === 'running')
          .map((animation) =>
            'animationName' in animation
              ? String(animation.animationName)
              : String((animation as CSSTransition).transitionProperty),
          ),
      CAST,
    );
  await expect.poll(running).toEqual([]);
  await bento(page).click();
  await expect(speechOf(page, 'cake')).toHaveText(guideFor('cake').funFacts[0]!);
  await expect.poll(running).toEqual([]);
});

test('with motion allowed the cast floats', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page);
  await expect
    .poll(() =>
      page.evaluate(
        (selector) => document.querySelector(selector)!.getAnimations({ subtree: true }).length,
        CAST,
      ),
    )
    .toBeGreaterThan(0);
});

test('nothing shifts: not on load, not on a tap', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await open(page);
  const heading = page.getByRole('heading', { level: 1 });
  const before = await heading.boundingBox();
  await bento(page).click();
  await expect(speechOf(page, 'cake')).toBeVisible();
  await page.waitForTimeout(400);
  expect(await heading.boundingBox()).toEqual(before);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls).toBeLessThan(0.05);
});

test('every character is at least 44px square', async ({ page }) => {
  await open(page);
  const buttons = page.locator(`${CAST} button`);
  await expect(buttons).toHaveCount(3);
  for (const button of await buttons.all()) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`axe clean, a fact open, reduced motion ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await open(page);
    await bento(page).click();
    await expect(speechOf(page, 'cake')).toBeVisible();
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page })
      .include('main > header')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}

test('no sideways scroll at 320px, every fact open', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await open(page);
  for (const button of await page.locator(`${CAST} button`).all()) await button.click();
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe('screenshots', () => {
  test.skip(!process.env['CHARACTER_SHOTS'], 'set CHARACTER_SHOTS=1 to take them');
  for (const width of [320, 375, 1440]) {
    for (const [label, classes] of [
      ['one', [stubClass()]],
      ['three', threeCrafts()],
    ] as const) {
      test(`hero at ${width} with ${label} craft`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 800 });
        await open(page, [...classes]);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: info.outputPath(`hero-${width}-${label}.png`) });
        await bento(page).click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: info.outputPath(`hero-${width}-${label}-fact.png`) });
      });
    }
  }
});
