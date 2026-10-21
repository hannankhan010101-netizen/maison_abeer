import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The saved ticket: a real PNG drawn by the browser's canvas, measured from the
 * bytes of the download. jsdom has no canvas, so this is where `renderTicket`
 * is proven.
 *
 * Headless Chromium has no share sheet, and a desktop one may claim it can
 * share files; `canShare` is pinned to false so the download path runs every
 * time. The share path is unit-tested in `ticketCanvas.test.ts`.
 *
 * Set `TICKET_SHOT_DIR` to keep a copy of each picture for looking at.
 */

const SLUG = 'maison-abeer';
const SOON = new Date(Date.now() + 3 * 86_400_000).toISOString();
const TOKEN = 'secret-portal-token-123';
const LONG_NAME = 'Hand-built pottery and glaze painting for complete beginners';

function classPayload(name: string, location: string | null) {
  return {
    studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
    classes: [
      {
        id: 'class-1',
        name,
        starts_at: SOON,
        ends_at: SOON,
        location,
        color_token: 'pink',
        seats_left: 4,
        is_full: false,
        waitlist_is_open: false,
      },
    ],
  };
}

async function book(
  page: Page,
  {
    name = 'Bento cake decorating',
    location = 'Studio A' as string | null,
    outcome = 'booked' as 'booked' | 'waitlisted',
  } = {},
) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', {
      value: () => false,
      configurable: true,
    });
  });
  await page.route('**/api/v1/public/**', async (route) => {
    const isBooking = route.request().method() === 'POST';
    await route.fulfill({
      status: isBooking ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        isBooking
          ? {
              outcome,
              class_name: name,
              starts_at: SOON,
              location,
              waitlist_position: outcome === 'waitlisted' ? 2 : null,
              portal_token: TOKEN,
              portal_token_type: 'magiclink',
            }
          : classPayload(name, location),
      ),
    });
  });

  await page.goto(`/book/${SLUG}`);
  await page.getByRole('button', { name: new RegExp(name.slice(0, 20)) }).click();
  await page.getByLabel(/Your name/).fill('Sana R.');
  await page.getByLabel(/Phone/).fill('03001234567');
  await page.getByRole('button', { name: /Book my spot|Join the waitlist/ }).click();
  await expect(page.getByRole('heading', { name: /You’re (in|on the list)/ })).toBeVisible();
}

async function saveAndMeasure(page: Page, label: string) {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save my ticket' }).click();
  const download = await downloading;
  const path = await download.path();
  const bytes = readFileSync(path);

  const shots = process.env['TICKET_SHOT_DIR'];
  if (shots) {
    mkdirSync(shots, { recursive: true });
    copyFileSync(path, join(shots, `${label}-${test.info().project.name}.png`));
  }

  await expect(page.getByText('Saved to your photos or downloads')).toBeVisible();
  expect(urls.some((url) => url.includes(TOKEN))).toBe(false);
  return { name: download.suggestedFilename(), bytes };
}

function expectTicketPng(bytes: Buffer) {
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);
  expect(bytes.length).toBeLessThan(600 * 1024);
}

test.describe('the saved ticket', () => {
  test('a booked seat saves as a 1080x1350 PNG named for the class', async ({ page }) => {
    await book(page);
    const { name, bytes } = await saveAndMeasure(page, 'normal');
    expect(name).toBe('bento-cake-decorating-ticket.png');
    expect(name).not.toContain(TOKEN);
    expectTicketPng(bytes);
  });

  test('a 60-character name with no location still saves', async ({ page }) => {
    expect(LONG_NAME).toHaveLength(60);
    await book(page, { name: LONG_NAME, location: null });
    const { name, bytes } = await saveAndMeasure(page, 'long-no-location');
    expect(name).toMatch(/-ticket\.png$/);
    expectTicketPng(bytes);
  });

  test('a waitlist place gets no ticket', async ({ page }) => {
    await book(page, { outcome: 'waitlisted' });
    await expect(page.getByRole('button', { name: 'Open my portal ✨' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save my ticket' })).toHaveCount(0);
  });

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`the confirmation with its Save button is axe clean (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await book(page);
      await expect(page.getByRole('button', { name: 'Save my ticket' })).toBeVisible();
      // Let the rise-in finish so axe reads settled colours.
      await page.waitForTimeout(900);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
