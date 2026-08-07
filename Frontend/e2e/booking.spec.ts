import { expect, test, type Page } from '@playwright/test';

/**
 * The public booking page.
 *
 * This one is walked by strangers on phones, from an ad, with no support
 * channel. It is also the only page a demo-mode run cannot cover, because it
 * talks to the API directly — so these intercept the network instead.
 */

const SLUG = 'maison-abeer';
const SOON = new Date(Date.now() + 3 * 86_400_000).toISOString();

function classPayload(overrides: Record<string, unknown> = {}) {
  return {
    studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
    classes: [
      {
        id: 'class-1',
        name: 'Bento cake decorating',
        starts_at: SOON,
        ends_at: SOON,
        location: 'Studio A',
        color_token: 'pink',
        seats_left: 4,
        is_full: false,
        waitlist_is_open: false,
        ...overrides,
      },
    ],
  };
}

async function stubApi(page: Page, classes: unknown, booking?: unknown) {
  await page.route('**/api/v1/public/**', async (route) => {
    const isBooking = route.request().method() === 'POST';

    await route.fulfill({
      status: isBooking ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify(isBooking ? booking : classes),
    });
  });
}

test.describe('booking a class', () => {
  test('a guest can book in three steps', async ({ page }) => {
    await stubApi(page, classPayload(), {
      outcome: 'booked',
      class_name: 'Bento cake decorating',
      starts_at: SOON,
      location: 'Studio A',
      waitlist_position: null,
    });

    await page.goto(`/book/${SLUG}`);

    await expect(page.getByRole('heading', { name: 'Maison Abeer' })).toBeVisible();

    await page.getByRole('button', { name: /Bento cake decorating/ }).click();
    await page.getByLabel(/Your name/).fill('Sana R.');
    await page.getByLabel(/Phone/).fill('03001234567');
    await page.getByRole('button', { name: 'Book my spot' }).click();

    await expect(page.getByRole('heading', { name: /You’re in/ })).toBeVisible();
  });

  test('the page is reachable without signing in', async ({ page }) => {
    await stubApi(page, classPayload());

    await page.goto(`/book/${SLUG}`);

    // The middleware guards every other route; this one must not redirect.
    await expect(page).toHaveURL(new RegExp(`/book/${SLUG}$`));
    await expect(page.getByRole('heading', { name: 'Pick your class' })).toBeVisible();
  });

  test('a full class offers the waitlist rather than a dead end', async ({ page }) => {
    await stubApi(page, classPayload({ seats_left: 0, is_full: true }), {
      outcome: 'waitlisted',
      class_name: 'Bento cake decorating',
      starts_at: SOON,
      location: null,
      waitlist_position: 2,
    });

    await page.goto(`/book/${SLUG}`);
    await page.getByRole('button', { name: /Bento cake/ }).click();
    await page.getByLabel(/Your name/).fill('Sana R.');
    await page.getByLabel(/Phone/).fill('03001234567');
    await page.getByRole('button', { name: 'Join the waitlist' }).click();

    await expect(page.getByRole('heading', { name: /You’re on the list/ })).toBeVisible();
    // Being told the position is the difference between a queue and a void.
    await expect(page.getByText(/number\s*2\s*in the queue/)).toBeVisible();
  });

  test('a missing name is caught before a round trip', async ({ page }) => {
    await stubApi(page, classPayload());

    await page.goto(`/book/${SLUG}`);
    await page.getByRole('button', { name: /Bento cake/ }).click();
    await page.getByRole('button', { name: 'Book my spot' }).click();

    await expect(page.getByRole('alert').filter({ hasText: /name/i })).toContainText(
      /tell us your name/i,
    );
  });

  test('the server message is shown, not a generic failure', async ({ page }) => {
    await page.route('**/api/v1/public/**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'conflict', message: 'That class just filled up.' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(classPayload()),
      });
    });

    await page.goto(`/book/${SLUG}`);
    await page.getByRole('button', { name: /Bento cake/ }).click();
    await page.getByLabel(/Your name/).fill('Sana');
    await page.getByLabel(/Phone/).fill('0300111');
    await page.getByRole('button', { name: 'Book my spot' }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: 'That class just filled up.' }),
    ).toBeVisible();
  });

  test('the honeypot is not reachable by tabbing', async ({ page }) => {
    await stubApi(page, classPayload());

    await page.goto(`/book/${SLUG}`);
    await page.getByRole('button', { name: /Bento cake/ }).click();

    const honeypot = page.locator('input[name="website"]');
    await expect(honeypot).toHaveCount(1);
    await expect(honeypot).toHaveAttribute('tabindex', '-1');
    // Hidden from the accessibility tree, so a screen reader never meets it.
    await expect(page.locator('[aria-hidden="true"] input[name="website"]')).toHaveCount(1);
  });
});
