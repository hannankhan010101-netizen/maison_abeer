import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { stubBookingApi, threeCrafts } from './helpers/booking';

/**
 * The sign-in door, measured in a browser.
 *
 * Unit tests pin the form's behaviour; these pin what only a browser can see:
 * contrast with the motion running and with it off, input sizes that keep iOS
 * from zooming, touch targets, no sideways scroll on a phone, the sparkle that
 * stays with its word, and the storefront's Fraunces never being fetched here.
 */

test.describe.configure({ timeout: 120_000 });

/** Open /login and wait until every finite animation has settled. */
async function openLogin(page: Page) {
  await page.goto('/login');
  await page.locator('#email').waitFor({ state: 'visible' });
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`/login has no accessibility violations (${reducedMotion} motion)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await openLogin(page);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const summary = results.violations.map((violation) => ({
      rule: violation.id,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.html.slice(0, 200)),
    }));

    expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
  });
}

test('the login inputs are at least 16px', async ({ page }) => {
  await openLogin(page);

  const small = await page.evaluate(() =>
    [...document.querySelectorAll('input')]
      .filter((el) => el.getBoundingClientRect().height > 0)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${el.id || el.tagName}: ${getComputedStyle(el).fontSize}`),
  );

  expect(small, 'these will zoom on iOS').toEqual([]);
});

test('every control on /login is at least 44px tall', async ({ page }) => {
  await openLogin(page);

  const tooSmall = await page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll('button, a[href], input, [role="button"]')) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (el.className.toString().includes('sr-only')) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      if (box.height < 44 || box.width < 44) {
        const name = el.getAttribute('aria-label') ?? el.id ?? el.tagName;
        bad.push(`${el.tagName} ${name} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    return bad;
  });

  expect(tooSmall).toEqual([]);
});

test('/login never scrolls sideways', async ({ page }) => {
  await openLogin(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

/** The distinct line tops of a text range: one entry means one row. */
async function rowsOf(page: Page, selector: string, from: string) {
  return page.evaluate(
    ({ selector, from }) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        const start = text.indexOf(from);
        if (start === -1) continue;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, text.length);
        const tops = [...range.getClientRects()]
          .filter((rect) => rect.width > 0)
          .map((rect) => Math.round(rect.top));
        return [...new Set(tops)];
      }
      return null;
    },
    { selector, from },
  );
}

test('the sparkle stays on the row of its word', async ({ page }, testInfo) => {
  await openLogin(page);

  // The form's heading, on every screen.
  expect(await rowsOf(page, 'h1', 'back')).toHaveLength(1);

  // The brand panel's headline lives only from lg, so a phone has none to measure.
  if (testInfo.project.name === 'desktop') {
    const pair = page.getByText('bestie ✨', { exact: true });
    await expect(pair).toBeVisible();
    const rects = await pair.evaluate(
      (el) => [...el.getClientRects()].filter((rect) => rect.width > 0).length,
    );
    expect(rects, '"bestie ✨" broke across lines').toBe(1);
  }

  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
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

test('/login requests no Fraunces file', async ({ page, browser }, testInfo) => {
  // Learn the storefront's Fraunces family and file from the page that uses it.
  await stubBookingApi(page, threeCrafts());
  await page.goto('/book/maison-abeer');
  await expect(page.getByRole('heading', { level: 1, name: 'Maison Abeer' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const declared = await page.evaluate(() => {
    const variable = getComputedStyle(document.querySelector('h1')!).getPropertyValue(
      '--font-storefront-display-loaded',
    );
    return (variable.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
  });
  expect(declared, 'the storefront variable is empty').not.toBe('');

  const file = (await fontFaces(page))
    .filter((face) => face.family === declared)
    .map((face) => /url\("?([^")]+)"?\)/.exec(face.src)?.[1])
    .find(Boolean);
  expect(file, 'no @font-face rule names the Fraunces file').toBeTruthy();

  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: testInfo.project.use.viewport,
  });
  const login = await context.newPage();
  const requested: string[] = [];
  login.on('request', (request) => requested.push(request.url()));
  await openLogin(login);
  await login.waitForTimeout(500);

  expect(requested.filter((url) => url.endsWith(file!.split('/').pop()!))).toEqual([]);
  expect(await fontFaces(login)).not.toContainEqual(expect.objectContaining({ family: declared }));
  await context.close();
});
