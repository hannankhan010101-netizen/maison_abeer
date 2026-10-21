import { expect, test } from '@playwright/test';

/**
 * The booking link's preview: the card exists, and the page names itself.
 *
 * The e2e server points the API at a dead path on purpose, so the server-side
 * fetch fails fast and what is measured here is the fallback — which is the
 * case that must never break a share.
 */

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('the share card is a small PNG', async ({ request }) => {
  const response = await request.get('/book/maison-abeer/opengraph-image');

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^image\/png/);

  const body = await response.body();
  expect(body.length).toBeGreaterThan(0);
  expect(body.length).toBeLessThan(300 * 1024);
  expect([...body.subarray(0, 8)]).toEqual(PNG_MAGIC);
});

test('the page names itself and points at the card', async ({ page }) => {
  await page.goto('/book/maison-abeer');

  const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute('content');
  expect(ogImage).toMatch(/^https?:\/\/[^/]+\/.*\/opengraph-image(\?.*)?$/);
  expect(new URL(ogImage ?? '').pathname.endsWith('/opengraph-image')).toBe(true);

  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  expect(['Maison Abeer · book a class', 'Book a class']).toContain(await page.title());
});
