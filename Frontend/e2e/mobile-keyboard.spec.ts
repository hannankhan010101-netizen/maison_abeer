import { expect, test, type Page } from '@playwright/test';

/**
 * The virtual keyboard, modelled as what `resizes-content` says it is.
 *
 * ADR 0003 decision 3 ships two halves — `interactiveWidget:
 * 'resizes-content'` in `app/layout.tsx` and `dvh` at the call site — and
 * until this file neither half had ever been exercised. Headless Chrome has no
 * virtual keyboard, so `ChatThread`'s three-row `h-dvh` grid and `Modal`'s
 * `max-h-[90dvh]` bottom sheet were both written for a state no run had
 * entered. The chat is the one screen in the app where typing is the entire
 * point, and its composer was the thing the keyboard was covering.
 *
 * The model: `interactive-widget=resizes-content` specifies precisely that the
 * keyboard **shrinks the layout viewport**, which is exactly what
 * `page.setViewportSize()` does. Measured here, before and after a shrink,
 * every viewport unit tracks it — at 375×812 the chat section is 812px and the
 * dialog cap resolves to 730.8px; at 375×472 they are 472px and 424.8px. So a
 * short viewport is a faithful model of an open keyboard *under that setting*,
 * and the layout either survives it or does not.
 *
 * What that buys, precisely:
 *
 *   - it proves the layout survives a short layout viewport — the composer and
 *     send button stay inside it and hit-testable, the list still scrolls, the
 *     thread does not become a scrolling page, the dialog box stays wholly on
 *     screen and its submit is reachable
 *   - it does **not** prove `dvh` is what makes that work. `vh`, `dvh`, `svh`
 *     and `lvh` all resolve to the same number here, because this browser has
 *     neither a collapsing toolbar nor a keyboard. Swapping `h-dvh` for
 *     `h-screen` would keep every measurement below green — which is why the
 *     two class-list checks exist (one here on the chat section, one on the
 *     dialog in `mobile-occlusion.spec.ts`). Before this file the chat half
 *     had no guard at all: nothing in the repo mentioned its `h-dvh`.
 *   - it does **not** prove the browser obeys `interactive-widget`. Nothing
 *     here can: there is no widget to obey it. Deleting the line would drop
 *     Android Chrome back to `resizes-visual` — keyboard painted over the
 *     page, `dvh` unchanged — and every measurement below would still pass.
 *     Only the declaration test would fail, which is what makes it
 *     load-bearing rather than decorative.
 *   - it says **nothing** about iOS Safari, which is the wrong shape for this
 *     model. There the keyboard overlays instead of resizing, the layout
 *     viewport does not shrink, `interactiveWidget` has no effect, and only
 *     `visualViewport` reports it. A composer under an iOS keyboard is
 *     invisible to a resize-based test by construction, and still needs a
 *     human on a device.
 */

/*
 * Breakpoints, repeated here rather than shared. `mobile.spec.ts` and
 * `mobile-occlusion.spec.ts` each carry their own copy; ADR 0003 keeps these
 * helpers at the top of the file that uses them.
 */
const SM = 640;
const LG = 1024;

/** Skip when the viewport is at or above `width` — there is nothing to assert. */
function below(page: Page, width: number, what: string) {
  test.skip(page.viewportSize()!.width >= width, `${what} applies below ${width}px`);
}

/**
 * The keyboard's height, as a model rather than a measurement.
 *
 * A portrait software keyboard on a 375px-wide phone is roughly 270–346 CSS
 * px (Gboard and iOS both sit in that band, more with a predictive row). 340
 * is the pessimistic end of it: 812 − 340 = 472 on the phone project, 1024 −
 * 340 = 684 on the tablet. A regression that only bites with something taller
 * — a split keyboard, or a 320×568 phone where 340 leaves 228px — passes
 * here. Every assertion below is written against `window.innerHeight` rather
 * than against a literal, so the number is an assumption about *how short*,
 * not about what is being claimed.
 */
const KEYBOARD_PX = 340;

async function settled(page: Page) {
  // 30s, not the default 5: the dev server pays a full compile on the first
  // request to a route.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/**
 * Open the keyboard, i.e. shrink the layout viewport by its height.
 *
 * Nothing is restored afterwards: Playwright hands every test a fresh page, so
 * a resize cannot leak between them.
 */
async function keyboardUp(page: Page) {
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width, height: height - KEYBOARD_PX });
  await settled(page);
}

/**
 * Everything the three-row grid has to get right, read in one pass.
 *
 * One `evaluate` returning numbers rather than a handful of assertions on
 * locators, so a failure prints the geometry that caused it instead of
 * "expected true, got false".
 */
function chatGeometry(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector('section.grid')!;
    const composer = document.querySelector('#chat-draft') as HTMLTextAreaElement;
    const form = composer.closest('form')!;
    const send = document.querySelector('button[aria-label="Send"]') as HTMLElement;

    /*
     * The middle row of the grid. Reading it positionally is deliberate — the
     * row order *is* the thing under test — so its overflow is reported back
     * and asserted, and a reordering shows up as "the middle row no longer
     * scrolls" rather than as a silent measurement of the wrong box.
     */
    const list = section.children[1] as HTMLElement;

    /** Laid out at that point *and* not covered by anything at it. */
    const hit = (el: HTMLElement) => {
      const box = el.getBoundingClientRect();
      const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return at === el || el.contains(at);
    };

    // Ask for the bottom of the thread, then report where it actually landed.
    list.scrollTop = 1e6;

    return {
      innerHeight: window.innerHeight,
      sectionHeight: section.getBoundingClientRect().height,
      // The declaration, not the resolved value — see the header.
      sectionUsesDvh: [...section.classList].some((name) => name.includes('dvh')),
      formTop: form.getBoundingClientRect().top,
      formBottom: form.getBoundingClientRect().bottom,
      composerHit: hit(composer),
      sendHit: hit(send),
      documentHeight: document.documentElement.scrollHeight,
      listScrolls: getComputedStyle(list).overflowY === 'auto',
      listClientHeight: list.clientHeight,
      listScrollHeight: list.scrollHeight,
      listScrollTop: list.scrollTop,
    };
  });
}

/** How much of the message list is off-screen, i.e. whether it can scroll. */
function listOverflow(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector('#chat-draft')!.closest('section')!
      .children[1] as HTMLElement;
    return list.scrollHeight - list.clientHeight;
  });
}

/**
 * Put enough in the lounge that its list has somewhere to scroll.
 *
 * The composer is the only seam that can do this. `demoChat` starts empty by
 * design (`lib/demo/transport.ts`), and demo mode answers `fetch` *in the
 * page*, so `page.route()` never sees the request and cannot seed it either.
 * That couples this test to the demo write path: if sending ever breaks, these
 * fail for a reason that has nothing to do with the keyboard, so the loop is
 * bounded and says what it was waiting for.
 *
 * Bounded by the condition rather than by a message count, because the count
 * depends on the height: 10 messages overflow a 472px viewport, 17 a 684px
 * one. Seeding to a fixed N chosen at full height would roughly double the
 * sends. 24px of headroom rather than one, so "it still scrolls" is a scroll
 * and not a rounding artefact.
 */
async function seedUntilScrollable(page: Page) {
  const composer = page.locator('#chat-draft');
  const send = page.getByRole('button', { name: 'Send' });

  let sent = 0;
  while ((await listOverflow(page)) <= 24) {
    expect(
      sent,
      'the lounge never filled up enough to scroll — is the demo send path working?',
    ).toBeLessThan(40);
    sent += 1;

    await composer.fill(`keyboard guard message ${sent}`);
    await send.click();

    // One at a time. `submit()` early-returns while a send is in flight, so
    // clicking again before this settles silently drops the message and leaves
    // the draft in the box.
    await expect(composer).toHaveValue('');
    await expect(page.getByText('Sending…')).toHaveCount(0);
  }
}

/** Open the lounge thread. The only room whose demo GET returns messages. */
async function openTheLounge(page: Page) {
  await page.goto('/portal/chat');
  await settled(page);

  // By name, not by fixture id: the lounge is the room the demo transport
  // answers with `demoChat`, and the id is an implementation detail of it.
  await page.getByRole('link', { name: /The lounge/ }).click();
  await expect(page.locator('#chat-draft')).toBeVisible({ timeout: 30_000 });
  await settled(page);
}

test.describe('the viewport opts the keyboard into resizing the layout', () => {
  /*
   * At every width, because it is a document-level declaration rather than a
   * phone-width layout — and it is the *only* check on the half of decision 3
   * this harness cannot execute. Headless Chrome has no widget, so no amount
   * of measuring proves the keyword is in effect; the resize tests below model
   * what it buys, and this asserts we asked for it.
   */
  test('declares interactive-widget=resizes-content', async ({ page }) => {
    await page.goto('/today');

    /*
     * Android Chrome's default is `resizes-visual`: the keyboard is painted
     * over the page and `dvh` never changes, so every `dvh` height in the app
     * reports room that is not there. `contains`, not equality — Next writes
     * the whole viewport meta from `app/layout.tsx` and the other keys
     * (`maximum-scale=5`, WCAG 1.4.4) are not this test's business.
     */
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /interactive-widget=resizes-content/,
    );
  });
});

test.describe('the chat survives the keyboard', () => {
  test('keeps the composer on screen and the list scrolling', async ({ page }) => {
    below(page, LG, 'the on-screen keyboard');

    await openTheLounge(page);
    await keyboardUp(page);
    await seedUntilScrollable(page);

    const geometry = await chatGeometry(page);

    /*
     * The premise everything else rests on: the grid's height tracked the
     * shrink. `<= 1`, not equality — `dvh` resolves fractionally at other
     * heights (the dialog's 90dvh cap lands on 424.796875px), and this
     * assertion is about tracking, not about integers.
     */
    expect(
      Math.abs(geometry.sectionHeight - geometry.innerHeight),
      'the chat grid did not shrink with the viewport',
    ).toBeLessThanOrEqual(1);

    /*
     * And that it tracked it *because of the unit*, which no measurement here
     * can tell: `vh`, `dvh`, `svh` and `lvh` are indistinguishable in this
     * browser. So this reads the declaration, the same way the dialog's cap is
     * read in `mobile-occlusion.spec.ts`. Without it, `h-dvh` → `h-screen`
     * leaves this whole file green while shipping the exact Android defect
     * decision 3 was written for.
     */
    expect(geometry.sectionUsesDvh, 'the chat no longer sizes itself in dvh').toBe(true);

    // The composer is the point of the screen. Wholly inside the short
    // viewport, and hit-testable at both controls.
    expect(geometry.formTop).toBeGreaterThanOrEqual(0);
    expect(geometry.formBottom).toBeLessThanOrEqual(geometry.innerHeight + 1);
    expect(geometry.composerHit, 'something is covering the composer').toBe(true);
    expect(geometry.sendHit, 'something is covering the send button').toBe(true);

    /*
     * The shrink must not turn the thread into a scrolling page. It is a fixed
     * three-row grid with `overflow-hidden`; if a row stops fitting, the
     * document grows instead and the composer goes under the fold. Freezing
     * the section at its pre-shrink height measures 812 against a 472px
     * viewport here, so this is the assertion that catches it.
     */
    expect(
      geometry.documentHeight,
      'the thread grew past the viewport instead of fitting inside it',
    ).toBeLessThanOrEqual(geometry.innerHeight + 1);

    // The conversation is still reachable: the middle row absorbed the loss.
    expect(geometry.listScrolls, 'the middle row is no longer the scrolling one').toBe(true);
    expect(geometry.listScrollHeight).toBeGreaterThan(geometry.listClientHeight);
    expect(geometry.listScrollTop, 'the message list would not scroll').toBeGreaterThan(0);
  });

  test('survives a composer grown to its cap', async ({ page }) => {
    below(page, LG, 'the on-screen keyboard');

    await openTheLounge(page);
    await keyboardUp(page);
    await seedUntilScrollable(page);

    /*
     * The worst case the three-row grid has to absorb: the composer grows in
     * JS up to `max-h-[7.5rem]`, which is 137px of the 472 left over after the
     * keyboard. Seven lines reaches the cap. If the grid handed that growth to
     * the page instead of to the message list, this is where it shows.
     */
    await page.locator('#chat-draft').fill('one\ntwo\nthree\nfour\nfive\nsix\nseven');
    await settled(page);

    const geometry = await chatGeometry(page);

    expect(geometry.formTop).toBeGreaterThanOrEqual(0);
    expect(geometry.formBottom).toBeLessThanOrEqual(geometry.innerHeight + 1);
    expect(geometry.sendHit, 'the send button went under the fold as the composer grew').toBe(true);
    expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.innerHeight + 1);

    // The list gave up the space, and still scrolls on what is left.
    expect(geometry.listScrollHeight).toBeGreaterThan(geometry.listClientHeight);
    expect(geometry.listScrollTop).toBeGreaterThan(0);
  });
});

/*
 * Named for the keyboard being *open*, because
 * `mobile-occlusion.spec.ts` already has "the modal survives the keyboard" for
 * the at-rest declaration checks. Two describes with one title makes the two
 * files' failures indistinguishable in the reporter.
 */
test.describe('the modal survives the keyboard being open', () => {
  async function openAddGuest(page: Page) {
    await page.goto('/guests');
    await settled(page);

    await page.getByRole('button', { name: /Add a guest/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  }

  test('its cap tracks the shrink, so the whole box stays on screen', async ({ page }) => {
    below(page, LG, 'the on-screen keyboard');

    await openAddGuest(page);
    await keyboardUp(page);

    const geometry = await page.evaluate(() => {
      const box = document.querySelector('[role="dialog"]')!.getBoundingClientRect();
      return {
        innerHeight: window.innerHeight,
        top: box.top,
        bottom: box.bottom,
        height: box.height,
      };
    });

    // 90dvh of the *shrunk* viewport: 424.8px of 472, not 730.8px of 812.
    expect(
      geometry.height,
      'the dialog is taller than 90% of the viewport it is in',
    ).toBeLessThanOrEqual(geometry.innerHeight * 0.9 + 1);

    /*
     * This is the assertion with teeth. The sheet is bottom-aligned, so a cap
     * that does *not* track the shrink keeps its submit button on screen and
     * pushes the top of the box off instead: freezing the cap at its
     * pre-shrink 730.8px puts the dialog's top at −258.8px, with the title and
     * the first fields unreachable. "The submit is visible" passes that.
     * "The box fits" does not.
     */
    expect(
      geometry.top,
      'the top of the dialog is off the top of the screen',
    ).toBeGreaterThanOrEqual(-1);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.innerHeight + 1);
  });

  test('keeps the submit reachable, and the form completable', async ({ page }) => {
    below(page, LG, 'the on-screen keyboard');

    await openAddGuest(page);
    await keyboardUp(page);

    await page.locator('[role="dialog"] input').first().fill('Keyboard Guard');

    /*
     * Scrolled, not visible at rest — and deliberately so. At 375×812 with no
     * keyboard at all the dialog's content is 767px against a 730.8px cap, so
     * "Add guest" already sits 12px below the dialog's fold. The guarantee
     * being asserted is therefore *reachable by scrolling the dialog*, which
     * is the host's real path, not *on screen without scrolling*. (That the
     * app's most-used form hides its primary action behind a scroll on a phone
     * is a real finding, but it is a layout decision, not this guard's
     * business.)
     */
    const submit = page.getByRole('button', { name: 'Add guest' });
    await submit.scrollIntoViewIfNeeded();

    const reach = await submit.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        innerHeight: window.innerHeight,
        top: box.top,
        bottom: box.bottom,
        hit: at === el || el.contains(at),
      };
    });

    expect(reach.top).toBeGreaterThanOrEqual(0);
    expect(reach.bottom).toBeLessThanOrEqual(reach.innerHeight + 1);
    expect(reach.hit, 'the submit button is scrolled into view but covered').toBe(true);

    // Then finish the flow for real. A button Playwright cannot make
    // actionable fails here rather than measuring as present-and-useless.
    await submit.click();
    await expect(page.getByTestId('toast')).toBeVisible();
  });

  test('is still flush with the bottom edge, where the thumb is', async ({ page }) => {
    below(page, SM, 'the bottom sheet');

    await openAddGuest(page);
    await keyboardUp(page);

    const box = (await page.getByRole('dialog').boundingBox())!;
    const innerHeight = await page.evaluate(() => window.innerHeight);

    /*
     * The at-rest version of this lives in `mobile-occlusion.spec.ts`
     * ("rises from the bottom edge"). Carried into the keyboard-up state
     * because a sheet that re-centres itself when the viewport shortens is a
     * sheet whose primary action has moved away from the thumb at exactly the
     * moment the thumb is busy typing.
     */
    expect(innerHeight - (box.y + box.height)).toBeLessThanOrEqual(1);
  });
});
