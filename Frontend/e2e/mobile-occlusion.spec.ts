import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { CHAT_ENABLED } from './helpers/features';

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
 *     `env(safe-area-inset-bottom)` — fine at this browser's 0px inset, on top
 *     of the tabs on any phone with a home indicator. That second half is now
 *     measurable too: the last block in this file emulates the inset over CDP,
 *     and the same guarantees are asserted with it applied.
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
const GUEST = ['/portal', ...(CHAT_ENABLED ? ['/portal/chat'] : [])];

async function settled(page: Page) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/**
 * The keyboard's height, as a model. See `mobile-keyboard.spec.ts`, which
 * documents why a layout-viewport shrink is what `interactive-widget=
 * resizes-content` means and what that does and does not prove.
 */
const KEYBOARD_PX = 340;

async function keyboardUp(page: Page) {
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width, height: height - KEYBOARD_PX });
  await settled(page);
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

/*
 * The same question with the keyboard up.
 *
 * Every pinned surface in the app is positioned from the bar tokens relative
 * to the bottom edge, so a *uniform* shrink cannot change their relative
 * geometry — these are cheap, and close to tautological as long as that stays
 * true. They are here because "as long as that stays true" is the whole
 * premise: the first surface positioned from a viewport-relative number
 * instead of from the bar breaks it, and the keyboard is the state where a
 * 340px error is invisible to every other spec in the suite.
 *
 * Each test scans before *and* after, so what it states is "clear at rest,
 * clear with the keyboard up" rather than just "clear" — otherwise a surface
 * that was already covering the bar would make the after-scan meaningless.
 *
 * Three routes, not the nine above: all nine are covered at rest at full
 * height, and what the resize adds is the distinct shells (host bar + Fab,
 * host bar + Fab + a long list, guest bar) plus the overlays.
 */
test.describe("nor does the keyboard's resize push anything onto the tab bar", () => {
  for (const path of ['/today', '/guests', '/portal']) {
    test(`${path} with the keyboard up`, async ({ page }) => {
      below(page, LG, 'the on-screen keyboard');

      await page.goto(path);
      await settled(page);
      expect(await coveringTheTabBar(page)).toEqual([]);

      await keyboardUp(page);
      expect(await coveringTheTabBar(page)).toEqual([]);
    });
  }

  test('nor the toast', async ({ page }) => {
    below(page, LG, 'the on-screen keyboard');

    await page.goto('/guests');
    await settled(page);

    await page.getByRole('button', { name: /Add a guest/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
    expect(await coveringTheTabBar(page)).toEqual([]);

    // Shrink first, then submit, so the toast is laid out *into* the short
    // viewport rather than measured after being nudged by one.
    await keyboardUp(page);
    await page.locator('[role="dialog"] input').first().fill('Keyboard Guard');
    const submit = page.getByRole('button', { name: 'Add guest' });
    // The dialog's primary action is below its own fold on a phone even at
    // rest, so it has to be scrolled to before it can be clicked.
    await submit.scrollIntoViewIfNeeded();
    await submit.click();

    await expect(page.getByTestId('toast')).toBeVisible();
    expect(await coveringTheTabBar(page)).toEqual([]);
  });

  test('nor the More sheet', async ({ page }) => {
    below(page, LG, 'the More sheet');

    await page.goto('/today');
    await settled(page);
    expect(await coveringTheTabBar(page)).toEqual([]);

    await keyboardUp(page);
    await page.getByRole('button', { name: /More sections/ }).click();
    await expect(page.getByRole('dialog', { name: 'More sections' })).toBeVisible();

    /*
     * The sheet is the surface with the least room to spare: it clears the bar
     * by exactly 0px, sitting on top of its `border-t` and no further, which
     * is what moved this file's threshold from 1 to 0. At 375×472 its box is
     * 209.5–406.5 against a bar starting at 406.5.
     */
    expect(await coveringTheTabBar(page)).toEqual([]);
  });

  test('nor the modal', async ({ page }) => {
    below(page, LG, 'the on-screen keyboard');

    await page.goto('/guests');
    await settled(page);
    expect(await coveringTheTabBar(page)).toEqual([]);

    await page.getByRole('button', { name: /Add a guest/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });

    await keyboardUp(page);
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

/* ==========================================================================
   The same guarantees, with a home indicator underneath them.
   ========================================================================== */

/**
 * Every measurement above was taken in a browser that reports
 * `env(safe-area-inset-bottom)` as 0px — and 0 is the one value for which
 * these offsets do not have to be right. The toast's clearance, the "More"
 * sheet's offset and the Fab's all exist *because* of the inset; at 0 the term
 * they add is invisible, so a revert that drops it passes every test above.
 * The pre-ADR sheet is the proof: pinned at a flat `bottom-[68px]` it clears
 * a 65px bar box by 3px here and covers 31px of the tabs the moment the inset
 * turns on — ADR 0003's own "covers ~31px of the tabs on a phone with a home
 * indicator", which until now no run could see.
 *
 * Chromium can be told to report a real inset.
 * `Emulation.setSafeAreaInsetsOverride` over CDP makes
 * `env(safe-area-inset-bottom)` itself resolve to the value given, so these
 * tests exercise the production CSS rather than a test-only stand-in for it,
 * and nothing in `src/` had to change to make them possible. Measured in the
 * bundled Chromium (Playwright 1.62.1) at 375×812: the host bar's box goes
 * 65px → 99px and its top 747 → 713, while every clearance above it stays
 * exactly where it was.
 *
 * The override is per *page* and takes effect on the live layout, so one test
 * can walk several insets without reloading or re-opening anything.
 *
 * WHAT A GREEN RUN HERE DOES NOT PROVE. iOS Safari reports 0 for every
 * `env(safe-area-inset-*)` unless the document declares `viewport-fit=cover`,
 * and `app/layout.tsx` does not — iOS insets the whole viewport instead. CDP
 * ignores that gate: the inset resolves to 34 with the meta, with a plain
 * viewport meta, and with none at all. So this block proves a *conditional* —
 * the derivation is inset-invariant whenever the inset is non-zero — which is
 * the safety net that makes adding `viewport-fit=cover` a one-line change
 * instead of a layout audit. It does not prove the app meets an inset today,
 * and it does not model the rest of what `viewport-fit=cover` brings with it
 * (the visual viewport, its `dvh` interaction, rubber-band overscroll). That
 * sliver needs one pass on a notched device; see ADR 0003.
 */

/** iPhone X–16 portrait, and the number ADR 0003 cites. */
const HOME_INDICATOR = 34;

/**
 * The insets each derivation is measured at.
 *
 * 34 is an iPhone's home indicator, 21 an Android display cutout, 0 the value
 * every other test in this file runs at. Three rather than one because the
 * assertion below is about the *form* of the offset — a clearance that does
 * not move — and pinning that to a single device's number would be the cheap
 * version of the same test. They cost three CDP calls, not three navigations.
 */
const INSETS = [HOME_INDICATOR, 21, 0];

/**
 * One CDP session per page, kept, because the override is per page and per
 * session: a test that walks several insets has to reach the session that set
 * the first one.
 */
const cdpSessions = new WeakMap<Page, CDPSession>();

async function emulateInset(page: Page, bottom: number) {
  let cdp = cdpSessions.get(page);

  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    cdpSessions.set(page, cdp);
  }

  // An explicit 0 rather than `{ insets: {} }` for the baseline leg. Both
  // clear the override and both were measured as identical to a page that
  // never had one — bar box 65px, sheet `bottom: 65.5px` — but one code path
  // that always states the number it wants cannot drift from the number the
  // assertion below then checks for.
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom } });
}

/** What the page resolves `env(safe-area-inset-bottom)` to, in px. */
async function insetOf(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.height = 'env(safe-area-inset-bottom, 0px)';
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();

    return height;
  });
}

/**
 * The precondition that stops this block passing while proving nothing.
 *
 * Everything below asserts that geometry *does not change*, which is also
 * what a no-op override produces. If a future Chromium renames the command,
 * `cdp.send` throws and the block fails loudly — that case is safe. The
 * dangerous one is a silent no-op, where the whole block would go green
 * against the very revert it exists to catch. So every leg states the inset it
 * believes it is measuring at, and reads it back out of the page: 34 can never
 * pass as 0, nor 0 as 34.
 */
async function expectInset(page: Page, bottom: number) {
  expect(await insetOf(page), `the emulated ${bottom}px inset did not reach the page`).toBe(bottom);
}

interface Reading {
  inset: number;
  barTop: number;
  barHeight: number;
  /** Clearance in px from each pinned surface's bottom edge to the bar's top. */
  pinned: Record<string, number>;
}

/**
 * How far each pinned surface sits above the top of the bar.
 *
 * Signed and measured against the bar's *box* (`border-t` included), so a
 * surface resting on the border reads 0 and one covering the tabs reads
 * negative. Non-overlap only asks for the sign; what follows asks for the
 * number, because a hardcoded offset also produces a positive one.
 */
async function clearanceAboveTheBar(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const onScreen = (selector: string) =>
      [...document.querySelectorAll(selector)].find(
        (element) =>
          getComputedStyle(element).position === 'fixed' &&
          element.getBoundingClientRect().height > 0,
      );

    // Fixed and non-zero, not merely present: the header create button is in
    // the DOM below `lg` as a `display: none` sibling of the Fab.
    const bar = onScreen('nav[aria-label="Main"]')!.getBoundingClientRect();

    const pinned: Record<string, number> = {};

    for (const [name, selector] of [
      ['the More sheet', '[role="dialog"][aria-label="More sections"]'],
      ['the create button', 'button[aria-label="Add a guest"]'],
      ['the toast', '[data-testid="toast"]'],
    ] as const) {
      const element = onScreen(selector);
      if (element) pinned[name] = bar.top - element.getBoundingClientRect().bottom;
    }

    return { inset: 0, barTop: bar.top, barHeight: bar.height, pinned };
  });
}

/** Walk the insets on the layout as it stands, proving each one landed. */
async function acrossInsets(page: Page, insets = INSETS) {
  const readings: Reading[] = [];

  for (const inset of insets) {
    await emulateInset(page, inset);
    await expectInset(page, inset);
    readings.push({ ...(await clearanceAboveTheBar(page)), inset });
  }

  return readings;
}

/**
 * A surface's clearance is the same at every inset.
 *
 * This is the assertion with teeth, and it is stronger than non-overlap in
 * both directions. The bar's top edge moves up by the inset, so anything
 * pinned by a number — `bottom-[68px]`, `bottom-[200px]` — changes its
 * clearance the instant the inset turns on: too little and it covers the tabs,
 * too much and it floats, and non-overlap only objects to the first. Only an
 * offset that names the inset holds still.
 */
function expectPinnedToTheBar(readings: Reading[], surface: string) {
  const first = readings[0]!;
  const baseline = first.pinned[surface];

  // A surface that was never there measures as absent in every leg, and
  // "identical in all of them" would then be trivially true — which is how the
  // transient toast could have turned this into a test of nothing.
  expect(baseline, `${surface} was not on screen to be measured`).not.toBeUndefined();

  for (const reading of readings.slice(1)) {
    const gap = reading.pinned[surface];

    expect(
      gap,
      `${surface} left the screen before the inset reached ${reading.inset}px`,
    ).not.toBeUndefined();

    expect(
      gap,
      `${surface} clears the bar by ${gap}px at inset ${reading.inset} but by ${baseline}px at inset ${first.inset} — its offset does not name the inset`,
    ).toBeCloseTo(baseline!, 0);
  }
}

test.describe('with a home indicator underneath it', () => {
  test.beforeEach(async ({ page, browserName }) => {
    // Named reasons, so a project that stops running this shows up in the
    // report as a skip rather than as nothing at all.
    test.skip(browserName !== 'chromium', 'the inset is emulated over CDP');
    below(page, LG, 'the home-indicator offsets');

    await emulateInset(page, HOME_INDICATOR);
  });

  for (const path of [...PORTAL, ...GUEST]) {
    test(`${path} at rest`, async ({ page }) => {
      await page.goto(path);
      await settled(page);
      await expectInset(page, HOME_INDICATOR);

      expect(await coveringTheTabBar(page)).toEqual([]);
    });
  }

  test('nor does the More sheet', async ({ page }) => {
    await page.goto('/today');
    await settled(page);
    await expectInset(page, HOME_INDICATOR);

    await page.getByRole('button', { name: /More sections/ }).click();
    await expect(page.getByRole('dialog', { name: 'More sections' })).toBeVisible();

    expect(await coveringTheTabBar(page)).toEqual([]);
  });

  test('nor does the toast', async ({ page }) => {
    await page.goto('/guests');
    await settled(page);
    await expectInset(page, HOME_INDICATOR);

    await page.getByRole('button', { name: /Add a guest/ }).click();
    await page.locator('[role="dialog"] input').first().fill('Home Indicator');
    await page.locator('[role="dialog"] button').last().click();

    await expect(page.getByTestId('toast')).toBeVisible();
    expect(await coveringTheTabBar(page)).toEqual([]);
  });

  test('the sheet and the create button stay pinned to the bar', async ({ page }) => {
    await page.goto('/guests');
    await settled(page);

    await page.getByRole('button', { name: /More sections/ }).click();
    await expect(page.getByRole('dialog', { name: 'More sections' })).toBeVisible();

    const readings = await acrossInsets(page);

    expectPinnedToTheBar(readings, 'the More sheet');
    expectPinnedToTheBar(readings, 'the create button');

    /*
     * The baseline the clearances are measured against is itself pinned.
     *
     * Asserted as a *delta*, not as `64 + 1.5 + 34`: the bar's `border-t` is
     * 1.5px declared and snaps to 1px at both this suite's device pixel ratios
     * (2.625 on mobile, 1 on tablet), so the box measures 65 → 99. The same
     * snapping is why the sheet reads a flush 0.5px rather than 0.
     */
    const withInset = readings[0]!;
    const flat = readings[readings.length - 1]!;
    expect(withInset.inset, 'the first leg is the one with the inset').toBe(HOME_INDICATOR);
    expect(flat.inset, 'the last leg is the baseline').toBe(0);

    expect(withInset.barHeight - flat.barHeight, 'the bar did not absorb the inset').toBeCloseTo(
      HOME_INDICATOR,
      0,
    );
    expect(flat.barTop - withInset.barTop, 'the bar did not rise by the inset').toBeCloseTo(
      HOME_INDICATOR,
      0,
    );

    /*
     * And the sheet is pinned *to* the bar rather than above it by a number
     * that happens to clear. Invariance alone accepts a derivation with slack
     * added — `calc(… + env(…) + 200px)` holds still too — so the flush edge
     * is what says the sheet is positioned from the thing it has to clear.
     */
    expect(
      withInset.pinned['the More sheet'],
      'the sheet floats above the bar instead of sitting on it',
    ).toBeLessThan(1);
  });

  test('and so does the toast', async ({ page }) => {
    await page.goto('/guests');
    await settled(page);

    await page.getByRole('button', { name: /Add a guest/ }).click();
    await page.locator('[role="dialog"] input').first().fill('Home Indicator');
    await page.locator('[role="dialog"] button').last().click();
    await expect(page.getByTestId('toast')).toBeVisible();

    /*
     * Measured in its own test rather than alongside the sheet because the
     * pill is transient: `VISIBLE_MS` in `ui/Toast` is 3.2s, and opening the
     * sheet first would race it. Walking the insets on the live layout is
     * three CDP calls and three measurements — comfortably inside that window
     * — and `expectPinnedToTheBar` reports a vanished toast as such rather
     * than quietly measuring one leg fewer.
     */
    expectPinnedToTheBar(await acrossInsets(page), 'the toast');
  });
});
