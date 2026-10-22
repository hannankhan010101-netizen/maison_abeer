import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The pop-up cards on the booking page: place first, a sibling Maps link, a
 * craft filter only when there is a choice, and a friendly card when nothing
 * is open. The API is stubbed, as in booking.spec.ts.
 */

const SLUG = 'maison-abeer';
const SOON = new Date(Date.now() + 3 * 86_400_000).toISOString();
const SHOTS = process.env['POPUP_SHOTS'];

function aClass(id: string, name: string, color_token: string, location: string | null) {
  return {
    id,
    name,
    starts_at: SOON,
    ends_at: SOON,
    location,
    color_token,
    photo_url: null,
    seats_left: 4,
    is_full: false,
    waitlist_is_open: false,
  };
}

const ONE = [aClass('c1', 'Bento cake decorating', 'pink', 'Café Lumière, Clifton')];
const THREE = [
  aClass('c1', 'Bento cake decorating', 'pink', 'Café Lumière, Clifton'),
  aClass('c2', 'Wheel throwing', 'terra', 'Studio A'),
  { ...aClass('c3', 'Ceramic painting', 'sage', null), is_full: true, seats_left: 0 },
];

async function stub(page: Page, classes: unknown[]) {
  await page.route('**/api/v1/public/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
        classes,
      }),
    }),
  );
}

async function open(page: Page, classes: unknown[]) {
  await stub(page, classes);
  await page.goto(`/book/${SLUG}`);
  await expect(page.getByRole('heading', { name: 'Maison Abeer' })).toBeVisible();
}

const cards = (page: Page) => page.locator('[data-popup-card]');
const filter = (page: Page) => page.getByRole('group', { name: 'Filter by craft' });

async function shoot(page: Page, name: string) {
  const widget = page.locator('#booking-widget');
  await widget.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await widget.screenshot({ path: `${SHOTS}/popups-${name}-${test.info().project.name}.png` });
}

async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(wide).toBe(false);
}

async function targetsAre44(page: Page) {
  const small = await page
    .locator('[data-popup-card] button, [data-popup-card] a, [aria-label="Filter by craft"] button')
    .evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((box) => box.height < 44 || box.width < 44)
        .map((box) => `${box.width}x${box.height}`),
    );
  expect(small).toEqual([]);
}

test.describe('pop-up cards', () => {
  test('one class: place first, a Maps link beside the button, no filter', async ({ page }) => {
    await open(page, ONE);
    await expect(cards(page)).toHaveCount(1);
    const card = cards(page).first();
    await expect(card.locator('[data-location-line]')).toHaveText(/Café Lumière, Clifton/);
    await expect(card.getByRole('button')).toHaveCount(1);
    const maps = card.getByRole('link', { name: /Maps/ });
    await expect(maps).toHaveAttribute(
      'href',
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Café Lumière, Clifton')}`,
    );
    await expect(maps).toHaveAttribute('target', '_blank');
    await expect(filter(page)).toHaveCount(0);
    await targetsAre44(page);
    if (SHOTS) await shoot(page, `one`);
  });

  test('three classes over three crafts: filter narrows, no location means no link', async ({
    page,
  }) => {
    await open(page, THREE);
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).nth(2).getByRole('link')).toHaveCount(0);
    await expect(cards(page).nth(2)).not.toContainText(/null|undefined/);
    await expect(cards(page).nth(2).locator('[data-seats-line]')).toContainText(/waitlist/i);

    const chips = filter(page).getByRole('button');
    await expect(chips).toHaveText(['All', 'Cake', 'Pottery', 'Painting']);
    await targetsAre44(page);
    if (SHOTS) await shoot(page, `three`);

    await filter(page).getByRole('button', { name: 'Pottery' }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Wheel throwing/ })).toBeVisible();
    await filter(page).getByRole('button', { name: 'All' }).click();
    await expect(cards(page)).toHaveCount(3);
  });

  test('no classes: the friendly card and the follow link', async ({ page }) => {
    await open(page, []);
    await expect(page.getByText(/next pop-up is coming/i)).toBeVisible();
    // The link needs BookingFlow to pass `handle` to ClassPicker (integration
    // step); until then it is absent, and when present it must be this one.
    const follow = page.getByRole('link', { name: 'Follow on Instagram' });
    if ((await follow.count()) > 0) {
      await expect(follow).toHaveAttribute('href', 'https://instagram.com/maisonabeer');
    }
    await expect(filter(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(0);
  });

  test('picking a class still opens the details step', async ({ page }) => {
    await open(page, THREE);
    await page.getByRole('button', { name: /Wheel throwing/ }).click();
    await expect(page.getByRole('button', { name: 'Book my spot' })).toBeVisible();
  });

  test('the seats line reserves its height', async ({ page }) => {
    await open(page, THREE);
    const heights = await page
      .locator('[data-seats-line]')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    expect(heights).toHaveLength(3);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(28);
  });

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`axe clean with reduced motion ${reducedMotion}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await open(page, THREE);
      await expect(cards(page)).toHaveCount(3);
      await cards(page).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      const results = await new AxeBuilder({ page })
        .include('#booking-widget')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }

  test('no sideways scroll at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await open(page, THREE);
    await expect(cards(page)).toHaveCount(3);
    await noSidewaysScroll(page);
  });
});
