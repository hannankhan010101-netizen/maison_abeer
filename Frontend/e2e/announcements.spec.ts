import { expect, test, type ElementHandle, type Page } from '@playwright/test';

/**
 * A state change nothing announced.
 *
 * Three controls in the portal change what a region *displays* without
 * navigating: the calendar's week buttons (and now its swipe), the guest
 * filters and search, and picking a chat room. A sighted host sees the view
 * change. A screen-reader user got nothing — no page load to announce, no
 * focus move, and the changed content is nowhere near the reading position.
 * On a phone the chat case is the worst of them: the tap that opens a room
 * also hides the column the focused button was in, so focus falls to `<body>`
 * and there is no control left to re-read.
 *
 * **The ceiling, stated up front:** nothing in this file can hear a screen
 * reader. Playwright drives a Chromium with no assistive technology attached,
 * and axe cannot evaluate whether a mutation was spoken — which is exactly how
 * this survived 612 unit tests, 254 e2e tests and an axe pass over eleven
 * routes. What is asserted here is the set of mechanical preconditions AT
 * requires before it will speak:
 *
 *   1. the region exists and is empty after the first paint — it does not read
 *      the result of *opening a page* back at the host;
 *   2. the same DOM node is still connected after the interaction, because AT
 *      announces changes to a region it is already observing and a region
 *      inserted together with its text is silent (that was the shipped
 *      defect: `GuestList`'s `sr-only` count lived inside the branch that
 *      re-renders);
 *   3. the node is not inside anything `display: none` at the moment of the
 *      change — a region *revealed* by the same tap that fills it is as
 *      unannounced as one inserted by it, and `textContent` reads perfectly
 *      well on a hidden node, so only this distinguishes them;
 *   4. one announcement per change, never one per keystroke.
 *
 * Every assertion binds an `ElementHandle` captured *before* the interaction.
 * A `Locator` re-resolves on each `expect`, so it would happily find the
 * replacement node and pass — which is the bug, not the fix.
 *
 * No viewport skips: all three announcements are the same at every width. The
 * `display: none` hazard in (3) only exists below `lg`, where the chat's two
 * columns take turns, and asserting the region visible at 1440px is still
 * correct — so the guard runs everywhere and only *fails* on the projects
 * where the defect would be real.
 *
 * ADR 0004 records what is left: a human pass with VoiceOver on iOS Safari
 * (the PRD's host is on a phone) and NVDA, over /calendar, /guests and /chat.
 */

/** The live region as a bound node, not as a query that can re-resolve. */
async function announcer(page: Page): Promise<ElementHandle<HTMLElement | SVGElement>> {
  const handle = await page.locator('[data-testid="announcer"]').elementHandle();

  if (!handle) throw new Error('No live region on this page.');

  return handle;
}

/**
 * Is this node in the accessibility tree *right now*?
 *
 * `toBeVisible()` is the wrong question — the region is `sr-only`, so it is
 * 1px and clipped by design and would fail. `checkVisibility()` with no
 * options asks only what matters here: that neither the node nor an ancestor
 * is `display: none` or `content-visibility: hidden`.
 */
function inTheTree(region: ElementHandle<HTMLElement | SVGElement>): Promise<boolean> {
  return region.evaluate((node) => node.checkVisibility());
}

function spoken(region: ElementHandle<HTMLElement | SVGElement>): Promise<string> {
  return region.evaluate((node) => node.textContent ?? '');
}

test.describe('the guest list', () => {
  test('a filter tap names the list it produced', async ({ page }) => {
    await page.goto('/guests');
    await expect(page.getByRole('list', { name: 'Guests' })).toBeVisible();

    const region = await announcer(page);

    // Arriving on /guests is not a state the host changed. A region that
    // announced here would read the whole roster back at someone who just
    // tapped "Guests" in the nav.
    expect(await spoken(region)).toBe('');
    expect(await inTheTree(region)).toBe(true);

    await page.getByRole('button', { name: 'Regulars 💗' }).click();

    // Which list, not just the number: the tap changes the count and nothing
    // else on screen. Two of the six demo guests are regulars.
    await expect.poll(() => spoken(region)).toBe('2 guests, regulars');

    // The guarantee the text cannot give. `useGuests` keys on
    // `{search, regularsOnly}` with no placeholder data, so this tap really
    // did re-enter `isPending` and really did unmount the list — if the region
    // were still in there, this is the only assertion that would notice.
    expect(await region.evaluate((node) => node.isConnected)).toBe(true);
    expect(await inTheTree(region)).toBe(true);
  });

  test('a search announces its result once, not once per keystroke', async ({ page }) => {
    await page.goto('/guests');
    await expect(page.getByRole('list', { name: 'Guests' })).toBeVisible();

    const region = await announcer(page);

    // Count every mutation of the region itself. `characterData` as well as
    // `childList`: the first announcement *inserts* a text node (the region
    // starts empty) and every later one rewrites that node's `nodeValue`, so
    // a childList-only observer would see the first change and miss the extras
    // — and passing by not looking is what this test exists to avoid.
    await region.evaluate((node) => {
      window.__announcerMutations = 0;

      new MutationObserver((records) => {
        window.__announcerMutations = (window.__announcerMutations ?? 0) + records.length;
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });

    /*
     * "sana", because its prefixes give more than one count. Against the six
     * demo guests `full_name.toLowerCase().includes(term)` gives: "" → 6,
     * "s" → 3 (Sana, Ayesha, Hira), "sa" → 1, "san" → 1, "sana" → 1. A term
     * like "zainab" or "ayesh" is flat after the first letter, so an
     * un-debounced search would produce exactly one announcement too and this
     * assertion would be theatre.
     *
     * Typed key by key, never `fill()`: one input event yields one mutation by
     * construction, debounce or no debounce. 150ms a key is under the 250ms
     * debounce window — which resets on every key, so the correct build
     * coalesces all four into one query — and over the demo transport's 120ms
     * latency, so a build that queried per keystroke would have rendered, and
     * announced, "3 guests" on its way to "1 guest".
     */
    await page.getByLabel('Search guests').pressSequentially('sana', { delay: 150 });

    await expect.poll(() => spoken(region)).toBe('1 guest');

    // One mutation: the result, not the typing. A region re-read on every
    // keystroke is worse than the silence this whole file is about.
    expect(await page.evaluate(() => window.__announcerMutations)).toBe(1);
    expect(await region.evaluate((node) => node.isConnected)).toBe(true);
  });
});

test.describe('chat oversight', () => {
  test('opening a room names it, from a region that tap cannot have revealed', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByRole('heading', { level: 1, name: 'Chat oversight' })).toBeVisible();

    const room = page.getByRole('button', { name: /The lounge/ });
    await expect(room).toBeVisible();

    const region = await announcer(page);
    expect(await spoken(region)).toBe('');

    /*
     * The assertion this spec was rewritten for.
     *
     * The detail column is `!selected && 'hidden lg:grid'`, so before the tap
     * it is `display: none` below `lg`. A live region mounted in there is
     * outside the accessibility tree until the very interaction that fills it,
     * and `textContent` would still report the new room's name — green test,
     * silent phone, and the phone is the stated user. Hence the region is a
     * direct child of the `section`, above both columns, and hence this check
     * runs *before* the click on the mobile and tablet projects too.
     */
    expect(await inTheTree(region)).toBe(true);

    await room.click();

    /*
     * The *first* room, deliberately. The demo studio has exactly one, so
     * there is no second room to tap: a component that swallowed its first
     * state — "announce only once something has been said before" — would
     * fail here rather than be papered over by clicking twice. And this is
     * the tap with the strongest claim on an announcement: below `lg` it
     * applies `hidden` to the container holding the focused button, so focus
     * drops to `<body>` (a focus defect of its own, reported not fixed) and
     * this sentence is the only thing left that says what happened.
     */
    await expect.poll(() => spoken(region)).toBe('Reading The lounge');
    expect(await region.evaluate((node) => node.isConnected)).toBe(true);
    expect(await inTheTree(region)).toBe(true);
  });
});

test.describe('the calendar', () => {
  test('changing week names the week', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.getByRole('heading', { level: 1, name: 'This week' })).toBeVisible();

    const region = await announcer(page);
    expect(await spoken(region)).toBe('');
    expect(await inTheTree(region)).toBe(true);

    // The day number of next week's Monday, read off the browser's own clock
    // — the suite runs in demo mode against the real date, and the label is
    // formatted by Intl with no locale to pin here. `dates.test.ts` holds the
    // exact strings against explicit locales instead.
    const monday = await page.evaluate(() => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 7);
      return String(date.getDate());
    });

    await page.getByRole('button', { name: 'Next →' }).click();

    // The `h1` above says "This week" whichever week is showing, so this
    // region is the only thing that tells a screen-reader user where the
    // prev/next buttons and the swipe landed.
    await expect.poll(() => spoken(region)).toMatch(new RegExp(`^Week of .*\\b${monday}\\b`));
    expect(await region.evaluate((node) => node.isConnected)).toBe(true);
  });
});

declare global {
  interface Window {
    /** Set by the search test's observer, inside the page. */
    __announcerMutations?: number;
  }
}
