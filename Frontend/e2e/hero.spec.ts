import { expect, test, type Locator, type Page } from '@playwright/test';

import { stubBookingApi, threeCrafts } from './helpers/booking';

/**
 * The hero is alive, and none of it costs a guest anything.
 *
 * Three promises are measured here because a unit test cannot see them:
 *
 * - **A phone still scrolls.** A swipe that starts on a polaroid must scroll the
 *   page: a draggable that swallows touches turns the hero into a trap, and the
 *   guest cannot reach the booking form under it. A sideways flick must not make
 *   the page scroll sideways either.
 * - **A thrown polaroid stays in the fan.** It is let go of with momentum, so
 *   the bounds are the only thing keeping it on the page.
 * - **The headline's face is Fraunces on the booking page and nowhere else.**
 *   Its file must not be requested by `/login`.
 */

const FAN_CARD = '[data-dragtoss]';

async function openStorefront(page: Page) {
  await stubBookingApi(page, threeCrafts());
  await page.goto('/book/maison-abeer');
  await expect(page.getByRole('heading', { level: 1, name: 'Maison Abeer' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** The card, once Draggable has taken hold of it (it loads after mount). */
async function waitForDraggable(card: Locator) {
  await expect
    .poll(() => card.evaluate((node) => getComputedStyle(node).cursor), { timeout: 15_000 })
    .toBe('grab');
}

async function centre(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A finger, by way of the protocol: Playwright's own touchscreen can only tap. */
async function swipe(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 12;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  });
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (by.x * step) / steps, y: from.y + (by.y * step) / steps }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('on a phone, a vertical swipe that starts on a polaroid scrolls the page', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch only');
  await openStorefront(page);

  const card = page.locator(FAN_CARD).nth(1);
  await waitForDraggable(card);
  await card.scrollIntoViewIfNeeded();
  // Room to move in both directions, so a stuck page cannot pass by being at an end.
  await page.evaluate(() => window.scrollBy(0, 40));
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => window.scrollY);
  await swipe(page, await centre(card), { x: 0, y: -200 });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.scrollY);

  expect(after, `scrollY stayed at ${before}: the polaroid ate the swipe`).toBeGreaterThan(before);
});

test('control: the swipe helper scrolls the page when it starts on plain text', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch only');
  await openStorefront(page);
  await page.waitForTimeout(1000);

  const before = await page.evaluate(() => window.scrollY);
  await swipe(page, await centre(page.getByRole('heading', { level: 1 })), { x: 0, y: -200 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
});

test('on a phone, flicking a polaroid sideways does not make the page scroll sideways', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch only');
  await openStorefront(page);

  const card = page.locator(FAN_CARD).nth(1);
  await waitForDraggable(card);
  await card.scrollIntoViewIfNeeded();

  const before = (await card.boundingBox())!;
  await swipe(page, await centre(card), { x: 140, y: 0 });
  await page.waitForTimeout(1500);

  // The sideways flick is the card's own: it must have moved.
  const after = (await card.boundingBox())!;
  expect(
    Math.abs(after.x - before.x),
    'the polaroid did not follow a sideways flick',
  ).toBeGreaterThan(20);

  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});

test('on a desktop, a polaroid can be dragged and stays inside the fan', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'mouse only');
  await openStorefront(page);

  const card = page.locator(FAN_CARD).nth(1);
  const fan = card.locator('xpath=..');
  await waitForDraggable(card);
  await card.scrollIntoViewIfNeeded();

  const before = (await card.boundingBox())!;
  const start = await centre(card);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 90, start.y - 30, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1200);

  const moved = (await card.boundingBox())!;
  expect(
    Math.abs(moved.x - before.x) + Math.abs(moved.y - before.y),
    'the polaroid did not move',
  ).toBeGreaterThan(20);

  // Then thrown as far as the page allows: the bounds, not the pointer, must hold it.
  const here = await centre(card);
  await page.mouse.move(here.x, here.y);
  await page.mouse.down();
  await page.mouse.move(here.x + 900, here.y + 600, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(2000);

  const bounds = (await fan.boundingBox())!;
  const thrown = (await card.boundingBox())!;
  const slack = 2;
  expect(thrown.x).toBeGreaterThanOrEqual(bounds.x - slack);
  expect(thrown.y).toBeGreaterThanOrEqual(bounds.y - slack);
  expect(thrown.x + thrown.width).toBeLessThanOrEqual(bounds.x + bounds.width + slack);
  expect(thrown.y + thrown.height).toBeLessThanOrEqual(bounds.y + bounds.height + slack);
});

test('with reduced motion a polaroid is a still photograph: it does not move', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'mouse only');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStorefront(page);
  await page.waitForTimeout(1500);

  const card = page.locator(FAN_CARD).nth(1);
  await card.scrollIntoViewIfNeeded();
  const before = (await card.boundingBox())!;
  const start = await centre(card);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 90, start.y - 30, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const after = (await card.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
});

/** The family a page's own `@font-face` rules declare, and the file each one fetches. */
async function fontFaces(page: Page) {
  return page.evaluate(() => {
    const faces: { family: string; src: string }[] = [];
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (rule instanceof CSSFontFaceRule) {
          faces.push({
            family: rule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim(),
            src: rule.style.getPropertyValue('src'),
          });
        }
      }
    }
    return faces;
  });
}

test('the booking headline is set in the loaded Fraunces face, and /login never fetches it', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough');
  await openStorefront(page);

  const family = await page.evaluate(() => {
    const h1 = document.querySelector('h1')!;
    const unquote = (value: string) => value.trim().replace(/^['"]|['"]$/g, '');
    const variable = getComputedStyle(h1).getPropertyValue('--font-storefront-display-loaded');
    return {
      leading: unquote(getComputedStyle(h1).fontFamily.split(',')[0] ?? ''),
      declared: unquote(variable.split(',')[0] ?? ''),
    };
  });

  expect(family.declared, 'the storefront variable is empty').not.toBe('');
  expect(family.declared).not.toMatch(/fallback/i);
  expect(family.leading).toBe(family.declared);

  const loaded = await page.evaluate(
    (name) =>
      [...document.fonts].some(
        (face) => face.family.replace(/['"]/g, '') === name && face.status === 'loaded',
      ),
    family.declared,
  );
  expect(loaded, `${family.declared} never reached "loaded"`).toBe(true);

  // Which file is it? Next hashes the name, so ask the stylesheet that declares the face.
  const file = (await fontFaces(page))
    .filter((face) => face.family === family.declared)
    .map((face) => /url\("?([^")]+)"?\)/.exec(face.src)?.[1])
    .find(Boolean);
  expect(file, 'no @font-face rule names the Fraunces file').toBeTruthy();

  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const login = await context.newPage();
  const requested: string[] = [];
  login.on('request', (request) => requested.push(request.url()));
  await login.goto('/login');
  await login.evaluate(() => document.fonts.ready);
  await login.waitForTimeout(500);

  const requestedFile = requested.filter((url) => url.endsWith(file!.split('/').pop()!));
  expect(requestedFile, 'the login page fetched the storefront font').toEqual([]);
  expect(await fontFaces(login)).not.toContainEqual(
    expect.objectContaining({ family: family.declared }),
  );
  await context.close();
});
