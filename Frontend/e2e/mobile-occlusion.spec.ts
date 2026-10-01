import { expect, test, type Page } from '@playwright/test';

/**
 * Nothing fixed may cover anything else fixed.
 *
 * `mobile.spec.ts` measures how big controls are. It cannot see whether one is
 * sitting on top of another, which is a different defect with the same cause —
 * a pinned element positioned from a number instead of from the thing it has
 * to clear. Three shipped at once:
 *
 *   - the toast at `bottom-6` landed on the tab bar (y 744–788 over y 747–812)
 *   - the "More" sheet was pinned 68px up, above a bar that is 64px *plus*
 *     `env(safe-area-inset-bottom)` — fine in this browser, on top of the tabs
 *     on any phone with a home indicator
 *   - the modal capped its height in `vh`, which does not shrink for the
 *     keyboard, so its submit button sat underneath it
 *
 * All three were invisible to a suite that only measured sizes.
 */

/*
 * Breakpoints, because this suite runs at three widths.
 *
 * `sm` (640px) is where the modal stops being a bottom sheet and hover
 * affordances come back; `lg` (1024px) is where the tab bar and the floating
 * create button give way to the sidebar and the header button. A test asserting
 * phone behaviour at 1440px is not a failure, it is the wrong question.
 */
const SM = 640;
const LG = 1024;

/** Skip when the viewport is at or above `width` — there is nothing to assert. */
function below(page: Page, width: number, what: string) {
  test.skip(page.viewportSize()!.width >= width, `${what} applies below ${width}px`);
}

const PORTAL = ['/today', '/calendar', '/guests', '/prep', '/tags', '/messages', '/settings'];
const GUEST = ['/portal', '/portal/chat'];

async function settled(page: Page) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/**
 * Every fixed element that overlaps the fixed bottom bar.
 *
 * Full-viewport overlays are excluded: a backdrop covering everything is the
 * whole point of a backdrop, and it is `aria-hidden` and dismissable. What is
 * being looked for is a *content* element — a toast, a sheet, a floating
 * button — landing on the navigation.
 *
 * The threshold is 0, because "nothing covers the tab bar" means no overlap at
 * all. A 1px tolerance was wide enough to let the "More" sheet's bottom edge
 * sit on the bar's `border-t` and still pass — measured at exactly 1.0px here,
 * from a sheet pinned to the bar's content height and not its box — which is
 * the defect this file was written for. Everything else clears by a whole
 * 1rem (`ui/Fab`, `ui/Toast`), so the tolerance was buying nothing.
 */
async function coveringTheTabBar(page: Page) {
  return page.evaluate(() => {
    const bars = [...document.querySelectorAll('nav[aria-label="Main"]')]
      .map((nav) => ({ nav, box: nav.getBoundingClientRect() }))
      .filter(({ nav, box }) => box.height > 0 && getComputedStyle(nav).position === 'fixed');

    if (bars.length === 0) return [];

    const offenders: string[] = [];

    for (const element of document.querySelectorAll('body *')) {
      const style = getComputedStyle(element);
      if (style.position !== 'fixed') continue;
      if (style.visibility === 'hidden' || style.display === 'none') continue;

      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;

      // A deliberate full-screen scrim, not a misplaced control.
      const fullScreen = box.width >= window.innerWidth && box.height >= window.innerHeight * 0.9;
      if (fullScreen) continue;

      for (const { nav, box: bar } of bars) {
        if (nav === element || nav.contains(element) || element.contains(nav)) continue;

        const overlapY = Math.min(box.bottom, bar.bottom) - Math.max(box.top, bar.top);
        const overlapX = Math.min(box.right, bar.right) - Math.max(box.left, bar.left);
        if (overlapY > 0 && overlapX > 0) {
          offenders.push(
            `${element.tagName}.${element.className.toString().slice(0, 44)} covers ${Math.round(overlapY)}px of the tab bar`,
          );
        }
      }
    }

    return offenders;
  });
}

test.describe('nothing covers the tab bar', () => {
  for (const path of [...PORTAL, ...GUEST]) {
    test(`${path} at rest`, async ({ page }) => {
      await page.goto(path);
      await settled(page);

      expect(await coveringTheTabBar(page)).toEqual([]);
    });
  }

  test('nor does the toast', async ({ page }) => {
    await page.goto('/guests');
    await settled(page);

    await page.getByRole('button', { name: /Add a guest/ }).click();
    await page.locator('[role="dialog"] input').first().fill('Occlusion Guard');
    await page.locator('[role="dialog"] button').last().click();

    await expect(page.getByTestId('toast')).toBeVisible();
    expect(await coveringTheTabBar(page)).toEqual([]);
  });

  test('nor does the More sheet', async ({ page }) => {
    below(page, LG, 'the More sheet');

    await page.goto('/today');
    await settled(page);

    await page.getByRole('button', { name: /More sections/ }).click();
    await expect(page.getByRole('dialog', { name: 'More sections' })).toBeVisible();

    expect(await coveringTheTabBar(page)).toEqual([]);
  });
});

test.describe('the More sheet behaves like a dialog', () => {
  test('closes on Escape and gives focus back', async ({ page }) => {
    below(page, LG, 'the More sheet');

    await page.goto('/today');
    await settled(page);

    const trigger = page.getByRole('button', { name: /More sections/ });
    await trigger.click();

    const sheet = page.getByRole('dialog', { name: 'More sections' });
    await expect(sheet).toBeVisible();

    // Focus has to be inside, or Escape is the only way out and a keyboard
    // user never reaches the links.
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    // Back where it came from, not at the top of the document.
    await expect(trigger).toBeFocused();
  });

  test('traps Tab rather than leaking into the tab bar beneath it', async ({ page }) => {
    below(page, LG, 'the More sheet');

    await page.goto('/today');
    await settled(page);

    await page.getByRole('button', { name: /More sections/ }).click();
    const sheet = page.getByRole('dialog', { name: 'More sections' });

    const links = await sheet.getByRole('link').count();
    // One past the last item: without a trap this lands on the tab bar.
    for (let index = 0; index < links + 1; index += 1) await page.keyboard.press('Tab');

    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  });
});

test.describe('the modal survives the keyboard', () => {
  test('caps its height in dvh, not vh', async ({ page }) => {
    await page.goto('/guests');
    await settled(page);

    await page.getByRole('button', { name: /Add a guest/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    /*
     * `vh` ignores the keyboard and the collapsing toolbar, so a dialog capped
     * in it reports more room than exists and its footer ends up underneath
     * both. Resolved values are identical here — this reads the declaration.
     */
    const usesDvh = await dialog.evaluate((el) =>
      [...el.classList].some((name) => name.includes('dvh')),
    );
    expect(usesDvh, 'the dialog still caps its height in vh').toBe(true);
  });

  test('rises from the bottom edge, where the thumb is', async ({ page }) => {
    below(page, SM, 'the bottom sheet');

    await page.goto('/guests');
    await settled(page);

    await page.getByRole('button', { name: /Add a guest/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;

    // Flush with the bottom of the screen, not floating in the middle of it.
    expect(viewport.height - (box.y + box.height)).toBeLessThanOrEqual(1);
  });

  test('puts the primary action lowest', async ({ page }) => {
    below(page, SM, 'the stacked footer');

    await page.goto('/guests');
    await settled(page);

    await page.getByRole('button', { name: /Add a guest/ }).click();

    // Wait for the dialog before measuring anything inside it: the dev server
    // compiles a route on first visit, and a half-mounted footer measures as
    // whatever happens to have rendered so far.
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });

    const cancel = await page.getByRole('button', { name: 'Cancel' }).boundingBox();
    const save = await page.getByRole('button', { name: 'Add guest' }).boundingBox();

    // Nearest the thumb and above the keyboard, rather than the reverse.
    expect(save!.y).toBeGreaterThan(cancel!.y);
  });
});
