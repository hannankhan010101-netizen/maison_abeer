import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Can a thumb actually get to it, and does it answer when tapped?
 *
 * `mobile.spec.ts` proves every control is big enough and that the navigation
 * does not depend on hover. Neither says anything about *where* a control is,
 * or whether the thing you tapped acknowledged it — and those were the two
 * defects left once the sizes were right:
 *
 *   - the create actions sat at y=167 and y=265 on an 812px screen, 480–580px
 *     from where a thumb rests one-handed
 *   - the guest row's only target was the name text: 72×44 inside 343×100
 *   - the booking card's forward arrow was `group-hover:opacity-100`, so on a
 *     phone the app's conversion surface confirmed nothing at all
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

/**
 * The roster rows.
 *
 * Every measurement of the guest list waits on these rather than on the page,
 * because the rows are what arrives late — see `settled()`.
 */
const guestRows = (page: Page) => page.locator('ul[aria-label="Guests"] > li');

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
 * `next/font` swaps the display face in after first paint, so a control sized
 * by its line-height changes height when it lands.
 *
 * `content` is the part of the page the caller is about to measure, and
 * passing it is not optional for anything that measures the *end* of a list.
 * `networkidle` does not mean "the data arrived" here: the e2e run is demo
 * mode, so the roster resolves from in-process fixtures without issuing a
 * request at all, and the network is therefore idle *before* the query settles
 * rather than after. Measured on `/guests` at 375px: at the instant the
 * heading, `networkidle`, `fonts.ready` and two frames of rAF had all
 * returned, `ul[aria-label="Guests"]` held 0 rows and the document was 861px;
 * ~300ms later it held 6 and the document was 2220px.
 *
 * Polling the scroll height until it holds still is *not* a substitute, which
 * is worth recording because it is the obvious fix: the page sits at 861px for
 * ~18 frames before React commits the roster, so a stability check on its own
 * cannot tell "finished" from "has not started" and resolves on the pre-render
 * height.
 *
 * It is the right *second* step, though, because the content wait is not the
 * end of the growth either. `/guests` renders two cards from two queries, and
 * the one above the roster resolves ~200ms later: on tablet the document went
 * 1412 → 1776px after `ul[aria-label="Guests"]` already held all six rows, and
 * a scroll-to-bottom taken in between landed 340px short. So once the content
 * anchors us past the pre-render plateau, `holdsStill()` rides out the sibling
 * commits. Both halves are needed; neither works alone.
 */
async function settled(page: Page, content?: Locator) {
  // 30s, not the default 5: the dev server pays a full compile on the first
  // request to a route, which comfortably outruns the usual budget under four
  // parallel workers.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);

  if (content) {
    await expect(content.first()).toBeVisible({ timeout: 30_000 });
    await holdsStill(page);
  }

  // One frame, so the final layout pass has committed.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/**
 * Resolve once the document height has not changed for half a second.
 *
 * Only sound *after* a wait on real content — on its own it resolves on the
 * skeleton, which is the trap described above. 500ms because the gap between
 * the two `/guests` queries committing was measured at ~200ms and a window has
 * to clear the widest of those, not the narrowest.
 */
async function holdsStill(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let previous = -1;
        let held = 0;
        let frames = 0;

        const tick = () => {
          const height = document.documentElement.scrollHeight;
          held = height === previous ? held + 1 : 0;
          previous = height;

          // ~500ms at 60fps, and ~5s before giving up. Measuring anyway beats
          // timing out here: a page that never settles should fail on the
          // assertion that names what it wanted, with a number to read.
          if (held >= 30 || ++frames > 300) return resolve();

          requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      }),
  );
}

/**
 * Scroll to the true bottom and stay there.
 *
 * A one-shot `window.scrollTo(0, document.body.scrollHeight)` is wrong here
 * twice over: `html` carries `scroll-behavior: smooth` (`globals.css`), so the
 * call starts an animation rather than finishing a jump, and the target is read
 * from a height that is still being clamped against the layout of the moment.
 * Both were live — the clearance test below measured the last row 1314px *past*
 * the floating button, with the number wandering between runs (-1314, -582,
 * -310) according to how far the scroll had got.
 *
 * Call it after `settled(page, content)`, never instead of it: re-aiming at the
 * live `scrollHeight` holds the bottom while the page is growing *during* the
 * scroll, but it resolves as soon as the position repeats, so a commit that
 * lands afterwards still strands it short.
 */
async function scrollToBottom(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let previous = -1;
        let frames = 0;

        const tick = () => {
          // Re-aimed every frame: `scrollHeight` is the live value, and
          // `instant` opts out of the stylesheet's smooth behaviour so the
          // position is final when it is read rather than on its way.
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });

          if (window.scrollY === previous) return resolve();
          previous = window.scrollY;

          if (++frames > 120) return resolve();

          requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      }),
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

test.describe('the create action is within thumb reach', () => {
  // The floating button is `lg:hidden`; above it the header button is the
  // right affordance and is already in reach of a pointer.
  test.beforeEach(({ page }) => below(page, LG, 'the floating create button'));

  for (const { path, label } of [
    { path: '/guests', label: 'Add a guest' },
    { path: '/calendar', label: 'New session' },
  ]) {
    test(`${path} puts it in the bottom third`, async ({ page }) => {
      await page.goto(path);
      await settled(page);

      const fab = page.getByRole('button', { name: label, exact: true });
      await expect(fab).toBeVisible();

      const box = (await fab.boundingBox())!;
      const viewport = page.viewportSize()!;

      // Comfortable one-handed reach is the bottom third of the screen; the
      // header button it replaces was in the top quarter.
      expect(box.y).toBeGreaterThan(viewport.height * 0.66);

      // And it still clears the tab bar underneath it.
      const bar = (await page.locator('nav[aria-label="Main"]:visible').boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
    });
  }

  test('it opens the same thing the header button does', async ({ page }) => {
    await page.goto('/guests');
    await settled(page);

    await page.getByRole('button', { name: 'Add a guest', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('there is one create control, not two', async ({ page }) => {
    await page.goto('/guests');
    await settled(page);

    // The header button is hidden below `lg`. Two visible controls with the
    // same name is a worse outcome than the reach problem it was fixing.
    const visible = await page.getByRole('button', { name: /Add a guest/ }).count();
    expect(visible).toBe(1);
  });

  /*
   * Over-padding is invisible to a non-overlap assertion.
   *
   * `body` has carried `padding-bottom: env(safe-area-inset-bottom)` since
   * before the tab bars existed (`globals.css`), and `main` sits *inside* that
   * padding box — so naming the inset again in `main`'s own padding counted it
   * twice: 34px of dead scroll under every list on a notched phone, on an app
   * whose whole problem is vertical room. The test below said nothing, because
   * more padding never overlaps anything.
   *
   * Headless Chromium reports the inset as 0px, so the doubled term itself
   * cannot be measured here; `AppShell.test.tsx` asserts that exactly one layer
   * names it. What is measurable is the derivation: `main` reserves the bar
   * plus the floating button's clearance, and nothing else.
   */
  test('reserves the bar and the button, and no more', async ({ page }) => {
    await page.goto('/guests');
    await settled(page);

    const measured = await page.evaluate(() => {
      // `calc()` and `env()` only resolve in a browser, so the inset is read by
      // measuring a probe rather than by parsing a class name.
      const probe = document.createElement('div');
      probe.style.height = 'env(safe-area-inset-bottom)';
      document.body.append(probe);
      const inset = probe.getBoundingClientRect().height;
      probe.remove();

      const main = document.querySelector('main')!;

      return {
        inset,
        main: parseFloat(getComputedStyle(main).paddingBottom),
        body: parseFloat(getComputedStyle(document.body).paddingBottom),
        bar: parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--tab-bar-host'),
        ),
      };
    });

    // 6rem covers the floating button — `ui/Fab` sits 1rem above the bar and is
    // 56px tall — and leaves the 1.5rem of air the row below it needs.
    expect(measured.main).toBeCloseTo(measured.bar + 96, 0);

    // One owner for the home-indicator inset, and it is `body`.
    expect(measured.body).toBeCloseTo(measured.inset, 0);
  });

  test('the gap below the last row is clearance, not dead scroll', async ({ page }) => {
    await page.goto('/guests');
    await settled(page, guestRows(page));

    // A list shorter than the viewport never reaches the bottom of its own
    // padding box, so there is no gap to measure rather than a passing one.
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 1,
    );
    test.skip(!scrolls, 'the guest list is shorter than the viewport');

    await scrollToBottom(page);

    const fab = (await page.getByRole('button', { name: 'Add a guest' }).boundingBox())!;

    /*
     * Measured from the bottom of the *card*, not of the last `<li>`.
     *
     * The roster is a `p-5` panel, so between the last row and the end of the
     * in-flow content there is 20px of the card's own padding plus its 1.5px
     * border. That belongs to the card — it is the same inset above the first
     * row and beside every row — and it is not what `main`'s bottom padding
     * reserves. Starting the measurement at the row folded it into the number
     * and read 45.0px of "dead scroll" where 24.0px is the whole story, which
     * is why this failed on a correctly laid-out page.
     *
     * The card's bottom edge is also `main`'s content-box bottom, which is the
     * edge the reservation is about: with the safe-area inset named twice,
     * `body`'s padding lifts this edge while the button stays pinned to the
     * viewport, so the gap grows by the inset. That is the defect the 32px
     * bound discriminates — 1.5rem of air against the 3.5rem the doubled inset
     * produced — and it can only be read at this edge.
     */
    const contentBottom = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      return main.getBoundingClientRect().bottom - parseFloat(getComputedStyle(main).paddingBottom);
    });

    const gap = fab.y - contentBottom;

    // Positive, so the content ends above the button rather than beneath it;
    // the next test is the one that says the last row itself is not covered.
    expect(gap).toBeGreaterThan(0);
    expect(gap, 'the padding below the list is dead scroll').toBeLessThan(32);
  });

  test('the last row is not stranded underneath it', async ({ page }) => {
    await page.goto('/guests');
    await settled(page, guestRows(page));

    await scrollToBottom(page);

    const row = (await guestRows(page).last().boundingBox())!;
    const fab = (await page.getByRole('button', { name: 'Add a guest' }).boundingBox())!;

    // Checked before the overlap, because a non-overlap assertion is satisfied
    // by a row that is nowhere near the button — including one still sitting
    // 1300px below the fold because the scroll never arrived, which is how this
    // passed while its sibling failed on the same bad measurement.
    expect(row.y + row.height, 'the last row is not on screen to be covered').toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );

    const overlap = Math.min(row.y + row.height, fab.y + fab.height) - Math.max(row.y, fab.y);
    expect(overlap, 'the floating button covers the last guest').toBeLessThanOrEqual(0);
  });
});

test.describe('list rows are tappable across their whole width', () => {
  test('a tap far from the name still opens the guest', async ({ page }) => {
    await page.goto('/guests');
    await settled(page, guestRows(page));

    const row = guestRows(page).first();
    await row.scrollIntoViewIfNeeded();

    const box = (await row.boundingBox())!;
    const name = (await row.locator('a[href^="/guests/"]').boundingBox())!;

    // Well to the right of the name — dead space before the row became the
    // target, and where a thumb lands when scanning a list.
    const offsetX = box.width - 16;
    expect(box.x + offsetX).toBeGreaterThan(name.x + name.width + 24);

    // `click` on the row, not `mouse.click` at a coordinate: Playwright scrolls
    // it into view and hit-tests the point first, so this cannot silently pass
    // by landing on the tab bar instead.
    await row.click({ position: { x: offsetX, y: box.height / 2 } });

    // 30s, not the default 5: `/guests/[id]` is compiled on first visit, and
    // under four parallel workers that comfortably outruns the usual budget —
    // failing as "the tap did not navigate" rather than "this was building".
    await expect(page).toHaveURL(/\/guests\/[^/]+$/, { timeout: 30_000 });
  });
});

test.describe('a tap gets an answer', () => {
  test('the booking card shows its forward arrow without a hover', async ({ page }) => {
    below(page, SM, 'the always-visible arrow');

    await stubPublic(page);
    await page.goto('/book/maison-abeer');
    await settled(page);

    const card = page.locator('button[data-cursor-label="BOOK"]').first();
    const arrow = card.locator('span', { hasText: '→' }).last();

    // Decorative, so it is `aria-hidden` and located by CSS — but a guest on a
    // phone has to be able to see it, and a phone never hovers.
    const opacity = await arrow.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity), 'the arrow is invisible without hover').toBeGreaterThan(0.9);
  });

  test('and has a pressed state that is not hover-only', async ({ page }) => {
    await stubPublic(page);
    await page.goto('/book/maison-abeer');
    await settled(page);

    const classes = await page
      .locator('button[data-cursor-label="BOOK"]')
      .first()
      .getAttribute('class');

    // `hover:` alone never fires on a touch screen.
    expect(classes).toMatch(/active:/);
  });
});
