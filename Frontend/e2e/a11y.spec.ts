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

// Axe walks the whole accessibility tree, and does it against an unoptimised
// dev bundle. The default 30s is enough for a warm route and not enough for a
// cold one, which shows up as a `frame.evaluate` timeout rather than as a
// violation — a slow check misreported as a broken page.
test.describe.configure({ timeout: 120_000 });

/** The rule and the node, so a CI failure is actionable without a local repro. */
function summarise(
  violations: { id: string; impact?: string | null; help: string; nodes: { html: string }[] }[],
) {
  return violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.html.slice(0, 200)),
  }));
}

const PAGES = [
  '/today',
  '/calendar',
  '/guests',
  '/prep',
  '/tags',
  '/messages',
  '/settings',
  '/portal',
  '/portal/chat',
  '/chat',
  '/chat/broadcast',
];

for (const path of PAGES) {
  test(`${path} has no accessibility violations`, async ({ page }) => {
    await page.goto(path);
    // Wait for real content, not the loading skeleton.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    const summary = summarise(results.violations);

    expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
  });
}

/*
 * Reduced motion, for this page only.
 *
 * The booking page reveals its sections on scroll, which means anything below
 * the fold is still at `opacity-0` when axe walks the tree — and zero-opacity
 * text fails the contrast rule by definition. That made this check fail or
 * pass depending on how much of the page happened to be on screen.
 *
 * Asking for reduced motion is not hiding the problem: `useRevealOnScroll`
 * then renders every section in its settled state, which is exactly the state
 * whose colours are worth checking.
 */
test('the booking page has no accessibility violations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

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
  // Same actionable summary as the pages above, rather than a bare list of
  // rule ids: this is the one page a stranger sees, and "color-contrast"
  // without the node is not something anyone can fix from a CI log.
  const summary = summarise(results.violations);

  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
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
