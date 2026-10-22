import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { stubClass, threeCrafts, type StubClass } from './helpers/booking';
import { loadAllSections } from './helpers/lazy';

/**
 * "Which workshop are you?", in a real browser: done by keyboard alone, it ends
 * in a craft the studio teaches, saves a Story-size PNG (jsdom has no canvas,
 * so this is where `renderStoryCard` is proven), and books through. A studio
 * with one craft gets no quiz. The integrator mounts it (I2); until then this
 * spec is skipped.
 */

test.skip(!process.env.QUIZ_MOUNTED, 'mounted by the integrator in I2');
test.describe.configure({ timeout: 120_000 });

const POTTERY_ONLY = [
  stubClass({ id: 'class-2', name: 'Pottery & wheel throwing', color_token: 'terra' }),
];
const LONG_HANDLE = 'maison.abeer.pottery.and.cakes';

async function openQuiz(
  page: Page,
  { classes = threeCrafts(), handle = 'maisonabeer' as string | null } = {},
): Promise<Locator> {
  // Headless Chromium has no share sheet; pin the download path.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', {
      value: () => false,
      configurable: true,
    });
  });
  await page.route('**/api/v1/public/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        studio: { name: 'Maison Abeer', instagram_handle: handle },
        classes: classes satisfies StubClass[],
      }),
    }),
  );
  await page.goto('/book/maison-abeer');
  await expect(page.getByRole('heading', { name: 'Pick your class' })).toBeAttached({
    timeout: 30_000,
  });
  await loadAllSections(page, { timeout: 60_000 });
  return page.locator('section.quiz');
}

async function completeByKeyboard(page: Page, quiz: Locator) {
  await quiz.scrollIntoViewIfNeeded();
  await quiz.locator('.quiz-answer').first().focus();
  await page.keyboard.press('Enter');
  for (let step = 1; step < 5; step += 1) {
    await expect(quiz.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(step + 1));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
  }
  await expect(quiz.getByRole('button', { name: 'Book this one' })).toBeVisible();
}

async function shareAndMeasure(page: Page, quiz: Locator, label: string) {
  const downloading = page.waitForEvent('download');
  const share = quiz.getByRole('button', { name: 'Share to Story' });
  await share.focus();
  await page.keyboard.press('Enter');
  const download = await downloading;
  const bytes = readFileSync(await download.path());

  const shots = process.env['QUIZ_SHOT_DIR'];
  if (shots) {
    mkdirSync(shots, { recursive: true });
    copyFileSync(await download.path(), join(shots, `${label}-${test.info().project.name}.png`));
  }

  await expect(quiz.getByText('Saved to your photos or downloads')).toBeVisible();
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1920);
  expect(bytes.length).toBeLessThan(600 * 1024);
  return download.suggestedFilename();
}

test('three crafts: by keyboard to a result, a Story PNG, and booking', async ({ page }) => {
  const quiz = await openQuiz(page);
  await expect(quiz.getByRole('heading', { name: 'Which workshop are you?' })).toBeVisible();
  await completeByKeyboard(page, quiz);

  // Every first answer leans to cake.
  await expect(quiz.getByText('Bento cakes')).toBeVisible();
  const name = await shareAndMeasure(page, quiz, 'short-handle');
  expect(name).toBe('maison-cake-vibe.png');

  await quiz.getByRole('button', { name: 'Book this one' }).click();
  await expect(page.locator('#booking-widget')).toBeInViewport();
});

test('a thirty-character handle and no handle both save', async ({ page }) => {
  let quiz = await openQuiz(page, { handle: LONG_HANDLE });
  await completeByKeyboard(page, quiz);
  expect(await shareAndMeasure(page, quiz, 'long-handle')).toBe('maison-cake-vibe.png');

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  quiz = await openQuiz(page, { handle: null });
  await completeByKeyboard(page, quiz);
  expect(await shareAndMeasure(page, quiz, 'no-handle')).toBe('maison-cake-vibe.png');
});

test('Back keeps the answer', async ({ page }) => {
  const quiz = await openQuiz(page);
  const first = quiz.locator('.quiz-answer').nth(2);
  await first.click();
  await quiz.getByRole('button', { name: 'Back' }).click();
  await expect(quiz.locator('.quiz-answer').nth(2)).toHaveAttribute('aria-pressed', 'true');
});

test('one craft: no quiz', async ({ page }) => {
  const quiz = await openQuiz(page, { classes: POTTERY_ONLY });
  await expect(quiz).toHaveCount(0);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`axe clean (${reducedMotion}) on the question and the result`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    const quiz = await openQuiz(page);
    await quiz.scrollIntoViewIfNeeded();
    const question = await new AxeBuilder({ page }).include('section.quiz').analyze();
    expect(question.violations).toEqual([]);
    await completeByKeyboard(page, quiz);
    await page.waitForTimeout(400);
    const result = await new AxeBuilder({ page }).include('section.quiz').analyze();
    expect(result.violations).toEqual([]);
  });
}

test('no sideways scroll at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const quiz = await openQuiz(page, { handle: LONG_HANDLE });
  await completeByKeyboard(page, quiz);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await quiz.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
});
