import { expect, test } from '@playwright/test';

/**
 * The critical path a host actually walks.
 *
 * Unit tests render one component with a mocked client. These assert the
 * parts nothing else can: that the routes resolve, the nav connects them, the
 * layout survives a 375px viewport, and the data a screen needs actually
 * arrives through the provider stack.
 */

test.describe('the daily path', () => {
  test('the dashboard answers what needs me today', async ({ page }) => {
    await page.goto('/today');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Good (morning|afternoon|evening)/,
    );
    // The hero card is the whole point of the screen.
    await expect(page.getByRole('img', { name: /seats booked/ })).toBeVisible();
  });

  test('every nav destination resolves', async ({ page }) => {
    /*
     * Six routes, each compiled on first visit by the dev server this suite
     * starts. That server keeps its own build directory (`NEXT_DIST_DIR`), so
     * a fresh checkout or a cleaned cache compiles all six inside one test —
     * comfortably past the default budget, and it fails as "the link did not
     * navigate" rather than "this was still building".
     */
    test.slow();

    await page.goto('/today');

    /*
     * Located by href, not by label: the nav renders an emoji beside each
     * word, so an accessible-name match is fragile in a way the route is not.
     *
     * On a phone only four destinations sit in the tab bar and the rest are
     * behind "More", so anything not already visible is reached by opening
     * that first. The guarantee is unchanged — every destination resolves —
     * but there is now a tap in front of some of them.
     */
    for (const href of ['/calendar', '/guests', '/prep', '/tags', '/messages', '/settings']) {
      const link = page.locator(`nav a[href="${href}"]:visible`).first();

      if (!(await link.count())) {
        await page.getByRole('button', { name: /more sections/i }).click();
        await page.getByRole('menu').locator(`a[href="${href}"]`).click();
      } else {
        await link.click();
      }

      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('a quick action deep-links into the right module', async ({ page }) => {
    await page.goto('/today');

    // An alert or action that does not lead anywhere is noise (PRD §2.1).
    await page.getByRole('link', { name: 'Print name tags' }).click();
    await expect(page).toHaveURL(/\/tags$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/name tag/i);
  });

  test('the nav marks the current page', async ({ page }) => {
    await page.goto('/guests');
    await expect(page.locator('nav a[href="/guests"]:visible').first()).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

test.describe('guests', () => {
  test('the roster lists guests and filters to regulars', async ({ page }) => {
    await page.goto('/guests');

    await expect(page.getByText('Sana R.', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: /Regulars/ }).click();

    // Scoped to the list: the same page also shows a session roster, which
    // lists everyone booked regardless of the filter — correctly so.
    const guests = page.getByRole('list', { name: 'Guests' });
    await expect(guests.getByText('Meerab A.', { exact: true })).toHaveCount(0);
  });

  test('a critical allergy is visible on the roster', async ({ page }) => {
    await page.goto('/guests');

    // The one piece of data that must never be missed.
    await expect(page.getByText(/Nut allergy/i).first()).toBeVisible();
  });

  test('search narrows the list and recovers from no matches', async ({ page }) => {
    await page.goto('/guests');

    const search = page
      .getByRole('searchbox')
      .or(page.getByLabel(/search/i))
      .first();
    await search.fill('zzzz-no-such-guest');
    await expect(page.getByText(/No one by that name/i)).toBeVisible();

    await search.fill('');
    await expect(page.getByText('Sana R.', { exact: true }).first()).toBeVisible();
  });
});

test.describe('the calendar', () => {
  test('moves between weeks without losing the layout', async ({ page }) => {
    await page.goto('/calendar');

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();

    await page.getByRole('button', { name: /Next/ }).first().click();
    await expect(heading).toBeVisible();
  });
});

test.describe('name tags', () => {
  test('renders a printable sheet for a class', async ({ page }) => {
    await page.goto('/tags');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/name tag/i);
    await expect(page.getByRole('button', { name: /Export print PDF/ })).toBeVisible();
  });
});

test.describe('layout', () => {
  test('the page never scrolls sideways', async ({ page }) => {
    // Horizontal overflow on a phone is the classic mobile-first failure and
    // is invisible to a component test.
    for (const path of ['/today', '/calendar', '/guests', '/prep', '/tags', '/messages']) {
      await page.goto(path);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `${path} scrolls horizontally`).toBe(false);
    }
  });

  test('every interactive control meets the 44px touch target', async ({ page }) => {
    await page.goto('/today');

    const controls = await page.getByRole('button').all();

    for (const control of controls) {
      if (!(await control.isVisible())) continue;

      const box = await control.boundingBox();
      if (!box) continue;

      expect(box.height, `a control is ${box.height}px tall`).toBeGreaterThanOrEqual(44);
    }
  });
});
