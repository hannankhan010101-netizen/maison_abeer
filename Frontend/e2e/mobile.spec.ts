import { expect, test, type Page } from '@playwright/test';

/**
 * Mobile usability, measured rather than assumed.
 *
 * The PRD's user is on a phone, in a studio, one-handed, with clay on their
 * hands. Every check here is something a component test cannot see because it
 * only exists once real CSS lays out at a real width.
 */

const PORTAL = [
  '/today',
  '/calendar',
  '/guests',
  '/prep',
  '/tags',
  '/messages',
  '/settings',
  '/chat',
  '/chat/broadcast',
];

// The guest side. Demo mode answers these as though a guest is signed in, so
// the same touch-target and overflow rules are enforced on both audiences.
const GUEST = ['/portal', '/portal/chat'];

const PUBLIC_CLASSES = {
  studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
  classes: [
    {
      id: 'class-1',
      name: 'Bento cake decorating',
      starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      ends_at: new Date(Date.now() + 90_000_000).toISOString(),
      location: 'Studio A',
      color_token: 'pink',
      seats_left: 4,
      is_full: false,
      waitlist_is_open: false,
    },
  ],
};

/**
 * Wait for layout to settle before measuring.
 *
 * `next/font` swaps the display face in after first paint, and a control
 * sized by its line-height changes height when it lands. Measuring before
 * that is a race: the same assertion passes alone and fails in a full run,
 * which is the worst kind of test to leave behind.
 */
async function settled(page: Page) {
  // 30s, not the default 5: the dev server caches in memory on Windows (see
  // next.config.mjs), so the first request to a route pays a full compile.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

  // The heading renders before the data does. Controls that only exist once a
  // query resolves would otherwise be measured mid-mount, which showed up as
  // a failure that wandered between pages from run to run.
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);

  // One frame, so the final layout pass has committed.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function stubPublic(page: Page) {
  await page.route('**/api/v1/public/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PUBLIC_CLASSES),
    }),
  );
}

// ---------------------------------------------------------------------------
// Touch
// ---------------------------------------------------------------------------

test.describe('touch targets', () => {
  for (const path of [...PORTAL, ...GUEST]) {
    test(`${path} has no control smaller than 44px`, async ({ page }) => {
      await page.goto(path);
      await settled(page);

      const tooSmall = await page.evaluate(() => {
        const selector = 'button, a[href], input, select, [role="button"], [role="radio"]';
        const bad: string[] = [];

        for (const el of document.querySelectorAll(selector)) {
          // A checkbox wrapped in a label is tapped via the label, so the
          // label is the target. Measuring the 24px box would report a
          // defect where the real hit area is the whole row.
          const label = el.closest('label');
          const target = label && el.tagName === 'INPUT' ? label : el;
          const box = target.getBoundingClientRect();
          // Zero-size elements are hidden, not undersized.
          if (box.width === 0 || box.height === 0) continue;
          // A link inside a sentence is not a tap target in its own right.
          if (el.tagName === 'A' && el.closest('p')) continue;
          // Skip links and the like: keyboard affordances, never tapped.
          if (el.className.toString().includes('sr-only')) continue;
          // The booking form's honeypot, hidden from sight and from tabbing.
          if (el.closest('[aria-hidden="true"]')) continue;

          if (box.height < 44) {
            bad.push(
              `${el.tagName}.${el.className.toString().slice(0, 40)} ${Math.round(box.height)}px`,
            );
          }
        }

        return bad;
      });

      expect(tooSmall, `undersized controls on ${path}`).toEqual([]);
    });
  }
});

test('the booking form has no control smaller than 44px', async ({ page }) => {
  await stubPublic(page);
  await page.goto('/book/maison-abeer');
  await settled(page);
  await page.getByRole('button', { name: /Bento cake/ }).click();

  const tooSmall = await page.evaluate(() =>
    [...document.querySelectorAll('button, input')]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        // The honeypot is off-screen and untabbable — not a target.
        if (el.closest('[aria-hidden="true"]')) return false;
        return box.height > 0 && box.height < 44;
      })
      .map((el) => `${el.tagName} ${Math.round(el.getBoundingClientRect().height)}px`),
  );

  expect(tooSmall).toEqual([]);
});

// ---------------------------------------------------------------------------
// The iOS zoom trap
// ---------------------------------------------------------------------------

test.describe('form fields', () => {
  test('inputs are at least 16px, so iOS does not zoom on focus', async ({ page }) => {
    // Safari zooms the whole page when a focused input is under 16px, and the
    // user is then left scrolled sideways on a form. It is the single most
    // common mobile-form defect and is invisible at desktop width.
    await stubPublic(page);
    await page.goto('/book/maison-abeer');
    await page.getByRole('button', { name: /Bento cake/ }).click();

    const small = await page.evaluate(() =>
      [...document.querySelectorAll('input, select, textarea')]
        .filter((el) => !el.closest('[aria-hidden="true"]'))
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => `${el.getAttribute('name') ?? el.tagName}: ${getComputedStyle(el).fontSize}`),
    );

    expect(small, 'these will zoom on iOS').toEqual([]);
  });

  test('the login fields are at least 16px', async ({ page }) => {
    // Covered separately because it is the first screen anyone touches, and
    // because it was missed: the guard checked `/book` and `/settings` only,
    // so a `text-sm` sat on both login inputs unnoticed. Zooming the page the
    // moment someone taps Email is the worst possible first impression.
    await page.goto('/login');
    await page.locator('#email').waitFor({ state: 'visible' });

    const small = await page.evaluate(() =>
      [...document.querySelectorAll('input')]
        .filter((el) => el.getBoundingClientRect().height > 0)
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => `${el.id || el.tagName}: ${getComputedStyle(el).fontSize}`),
    );

    expect(small, 'these will zoom on iOS').toEqual([]);
  });

  test('portal inputs are at least 16px too', async ({ page }) => {
    await page.goto('/settings');
    await settled(page);

    // Wait for a field to actually exist before measuring.
    //
    // Without this the assertion passes whenever the form has not finished
    // rendering: `querySelectorAll` returns nothing, the filter yields an
    // empty array, and an empty array equals an empty array. It hid a real
    // `text-sm` on the shared `inputClasses` for as long as it existed —
    // green because it measured nothing, not because nothing was wrong.
    await page.locator('#quiet-start').waitFor({ state: 'visible' });

    const measured = await page.evaluate(() =>
      [...document.querySelectorAll('input, select, textarea')]
        .filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => ({
          id: el.getAttribute('id') ?? el.tagName,
          size: parseFloat(getComputedStyle(el).fontSize),
        })),
    );

    expect(measured.length, 'nothing was measured — the guard would be vacuous').toBeGreaterThan(0);

    const small = measured.filter((el) => el.size < 16).map((el) => `${el.id}: ${el.size}px`);

    expect(small, 'these will zoom on iOS').toEqual([]);
  });

  test('the phone field asks for a numeric keypad', async ({ page }) => {
    await stubPublic(page);
    await page.goto('/book/maison-abeer');
    await page.getByRole('button', { name: /Bento cake/ }).click();

    const phone = page.locator('input[name="phone"]');
    await expect(phone).toHaveAttribute('inputmode', 'tel');
    await expect(phone).toHaveAttribute('autocomplete', 'tel');
  });
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

test.describe('layout at 375px', () => {
  for (const path of [...PORTAL, ...GUEST, '/book/maison-abeer']) {
    test(`${path} never scrolls sideways`, async ({ page }) => {
      if (path.startsWith('/book')) await stubPublic(page);

      await page.goto(path);
      await settled(page);

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const widest = [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
          .map((el) => `${el.tagName}.${el.className.toString().slice(0, 40)}`);

        return { scrolls: doc.scrollWidth > doc.clientWidth + 1, widest: widest.slice(0, 3) };
      });

      expect(overflow.scrolls, `overflowing: ${overflow.widest.join(', ')}`).toBe(false);
    });
  }

  test('body text is never smaller than 12px', async ({ page }) => {
    await page.goto('/today');
    await settled(page);

    const tiny = await page.evaluate(() =>
      [...document.querySelectorAll('p, span, b, small, li, dd, dt')]
        .filter((el) => {
          const box = el.getBoundingClientRect();
          const text = el.textContent?.trim() ?? '';
          return (
            box.height > 0 && text.length > 3 && parseFloat(getComputedStyle(el).fontSize) < 12
          );
        })
        .map((el) => `${el.tagName} "${el.textContent?.trim().slice(0, 24)}"`),
    );

    expect(tiny.slice(0, 5)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// One-handed reach
// ---------------------------------------------------------------------------

test('the primary navigation is reachable without hovering', async ({ page }) => {
  await page.goto('/today');

  // A phone has no hover. Anything that only appears on :hover is unreachable.
  const nav = page.locator('nav a[href="/guests"]:visible').first();
  await expect(nav).toBeVisible();
  await nav.click();

  await expect(page).toHaveURL(/\/guests$/);
});

test('the viewport allows pinch-zoom', async ({ page }) => {
  await page.goto('/today');

  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');

  // Capping scale fails WCAG 1.4.4 and hurts exactly the in-studio,
  // one-handed use this product is for.
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/);
  expect(viewport).not.toMatch(/maximum-scale\s*=\s*1\b/);
});
