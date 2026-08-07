import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibility.
 *
 * The contrast validator already covers the palette; this covers what it
 * cannot — labels, roles, heading order, and whether a keyboard can actually
 * get through the app. Both matter, and only one of them was tested.
 *
 * `wcag2a` and `wcag2aa` only: the PRD commits to AA, and folding in
 * best-practice rules would fail the build on opinions rather than on the
 * standard.
 */

const PAGES = ['/today', '/calendar', '/guests', '/prep', '/tags', '/messages', '/settings'];

for (const path of PAGES) {
  test(`${path} has no accessibility violations`, async ({ page }) => {
    await page.goto(path);
    // Wait for real content, not the loading skeleton.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    // Print the rule and the node, so a failure is actionable from CI output
    // alone rather than needing a local repro.
    const summary = results.violations.map((violation) => ({
      rule: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.html.slice(0, 120)),
    }));

    expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
  });
}

test('the booking page has no accessibility violations', async ({ page }) => {
  await page.route('**/api/v1/public/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
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
      }),
    }),
  );

  await page.goto('/book/maison-abeer');
  await expect(page.getByRole('heading', { name: 'Pick your class' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('the whole dashboard is reachable by keyboard', async ({ page }) => {
  await page.goto('/today');

  // The skip link is the first stop, and the reason it exists.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /Skip to content/i })).toBeFocused();

  // Tabbing must not get stuck: 40 presses should move focus repeatedly, not
  // cycle between the same two elements.
  const seen = new Set<string>();

  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    seen.add(
      await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}:${el.textContent?.slice(0, 20) ?? ''}` : 'none';
      }),
    );
  }

  expect(seen.size, 'focus appears to be trapped').toBeGreaterThan(5);
});
