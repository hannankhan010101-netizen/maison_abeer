import { devices, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * What the booking page's 3D hero costs on slow hardware.
 *
 * `BookingHero` gates `Hero3D` behind `useMayAnimate`, which asks three
 * questions: `prefers-reduced-motion`, Data Saver, and whether the browser
 * itself calls the connection 2g. None of them is about the CPU, so a
 * mid-tier Android on 4G gets five animated three.js meshes behind the
 * headline. Nobody had ever measured what that costs, and this page's actual
 * job is a fast form for a stranger arriving from an ad on a phone.
 *
 * This file is the measurement, committed so the next person inherits the
 * number instead of the argument. It is not in `npm run test:e2e`: it needs
 * a production build (see ADR 0004 for why a dev server measures nothing)
 * and it runs under `playwright.perf.config.ts` at one worker.
 *
 * ## The three arms
 *
 * - **full** — the hero as shipped.
 * - **control** — `HTMLCanvasElement.prototype.getContext` refuses WebGL, so
 *   `three` still downloads, parses and constructs, R3F still mounts, the
 *   `<canvas>` element is still in the DOM and still laid out — only
 *   `WebGLRenderer` cannot be built, so no frame is ever submitted. `full −
 *   control` is therefore **the render loop**, with the library's download
 *   and parse, the component tree and the canvas element all held constant.
 *   That is the whole reason the result points at a post-mount bail-out as a
 *   fix: if the delta had been chunk parse, deciding not to animate after
 *   mounting would fix nothing.
 * - **reduced** — `prefers-reduced-motion: reduce`, which is the app's own
 *   suppression path. Used for the load comparison, where the question is
 *   about the shipped product rather than about one layer of it.
 *
 * ## What these numbers are not
 *
 * `Emulation.setCPUThrottlingRate` does not touch the GPU process, and
 * headless Chromium rasterizes on the CPU there (SwiftShader). So
 * rasterization, the hero's `maskImage` and the grain layer's
 * `mix-blend-overlay` all sit inside `full − control` without scaling with
 * the rate. The transferable claim is "the hero's **main-thread** cost
 * scales inversely with CPU speed, and the gradient behind it does not" —
 * which is exactly what the rate-1 arm of the frame test exists to prove.
 * "A mid-tier Android drops a quarter of the hero's frames" is an inference
 * from that, not a measurement.
 */

const SLUG = 'maison-abeer';
const SOON = new Date(Date.now() + 3 * 86_400_000).toISOString();

/**
 * A rAF delta above this is a frame the page failed to deliver on time.
 *
 * Written here rather than left to the reader: at a 60Hz target the budget
 * is 16.7ms, so 32ms is "two budgets went by and one frame arrived" — a
 * dropped frame, not a late one.
 */
const LONG_FRAME_MS = 32;

/** How long the at-rest frame window runs, in both arms. */
const FRAME_WINDOW_MS = 2500;

/**
 * The CPU throttle that models a mid-tier phone against this runner, and the
 * unthrottled arm it is checked against.
 *
 * 6x is the whole point; 1x is the control for the control — see the
 * `does not scale` half of the frame test.
 */
const SLOW_CPU = 6;
const FAST_CPU = 1;

/**
 * A mid-tier 4G link. Not a slow one, deliberately.
 *
 * `useMayAnimate` refuses to mount the hero when
 * `navigator.connection.effectiveType` is '2g' or 'slow-2g', so a throttle
 * profile that moved Chromium's Network Quality Estimator into those buckets
 * would silently delete the subject of this entire file: every arm would
 * agree, every ratio would be 1, and only the draw counter would notice.
 * Verified in this Chromium that `Network.emulateNetworkConditions` does not
 * feed the NQE — `effectiveType` stays '4g' whatever is set here — and
 * `expectHeroMounted` asserts it rather than trusting the note.
 */
const CELLULAR_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (4 * 1_000_000) / 8,
  uploadThroughput: (1 * 1_000_000) / 8,
};

/**
 * The payload, pinned to the subject.
 *
 * Two fields here are load-bearing and neither is obvious:
 *
 * - `hero_photo_url` **must** be null. `BookingHero` renders the 3D layer
 *   only under `mayAnimate && !hasPhoto`, with `hasPhoto =
 *   Boolean(heroPhotoUrl)` — a payload "completed" with a photo URL measures
 *   the photo hero instead: one canvas, zero WebGL, nothing to compare.
 * - `story` **must** be null. A story renders a `StorySection` above the
 *   booking widget (`BookingFlow`'s `Shell`), which moves every offset ADR
 *   0004's geometry notes were taken at. If the brand sections are ever
 *   wanted here, re-measure with them present; do not carry these numbers
 *   over.
 */
function classPayload() {
  return {
    studio: {
      name: 'Maison Abeer',
      instagram_handle: 'maisonabeer',
      logo_url: null,
      primary_color: null,
      accent_color: null,
      hero_photo_url: null,
      story: null,
    },
    classes: [
      {
        id: 'class-1',
        name: 'Bento cake decorating',
        starts_at: SOON,
        ends_at: SOON,
        location: 'Studio A',
        color_token: 'pink',
        photo_url: null,
        seats_left: 4,
        is_full: false,
        waitlist_is_open: false,
      },
    ],
  };
}

interface HeroProbe {
  draws: number;
  frames: number;
  longFrames: number;
  recording: boolean;
}

type ProbeWindow = typeof globalThis & { __heroProbe: HeroProbe };

/** Counts WebGL draw calls and records rAF deltas. Installed in every arm. */
function instrumentPage(longFrameMs: number) {
  const probe: HeroProbe = { draws: 0, frames: 0, longFrames: 0, recording: false };
  (window as unknown as ProbeWindow).__heroProbe = probe;

  /*
   * Both constructors, because `WebGL2RenderingContext.prototype` does not
   * inherit from `WebGLRenderingContext.prototype` — it owns its own
   * `drawArrays` and `drawElements`, and three.js takes the WebGL2 path
   * here. Both methods, because the scene mixes indexed geometry (torus,
   * sphere) with non-indexed `PolyhedronGeometry` (icosahedron, octahedron,
   * dodecahedron): wrapping `drawElements` alone would miss three of the
   * five shapes and `drawArrays` alone the other two.
   */
  for (const ctor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    const proto = ctor?.prototype as unknown as Record<string, unknown> | undefined;
    if (!proto) continue;

    for (const name of ['drawArrays', 'drawElements']) {
      const original = proto[name];
      if (typeof original !== 'function') continue;

      proto[name] = function patched(this: unknown, ...args: unknown[]) {
        probe.draws += 1;
        return (original as (...rest: unknown[]) => unknown).apply(this, args);
      };
    }
  }

  /*
   * A rAF chain, not a PerformanceObserver on `long-animation-frame`.
   * `long-animation-frame` reports frames that *happened* and took too long;
   * what is being compared here is frames the page failed to deliver at all,
   * and only a rAF delta sees one of those. The chain runs in every arm, so
   * its own cost cancels in the ratio.
   */
  let last = 0;
  const tick = (now: number) => {
    if (probe.recording) {
      if (last) {
        probe.frames += 1;
        if (now - last > longFrameMs) probe.longFrames += 1;
      }
      last = now;
    } else {
      last = 0;
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

/** The control arm: WebGL is unavailable, everything else is identical. */
function suppressWebgl() {
  /*
   * `three` still ships and still parses; only the context is refused.
   * `WebGLRenderer` then throws 'THREE.WebGLRenderer: Error creating WebGL
   * context.' — and that is where it stays.
   *
   * It does **not** reach `BookingHero`'s `CanvasBoundary`, which was the
   * expectation this spec was written against and measurement disproved. R3F
   * builds the renderer inside `configure()`, an async function awaited by
   * nothing in a layout effect (`events-*.esm.js`, `new
   * THREE.WebGLRenderer`), so the throw becomes an unhandled rejection; the
   * `if (error) throw error` path in `react-three-fiber.esm.js` only carries
   * errors its inner `ErrorBoundary` catches from scene *children*. So the
   * `<canvas>` stays mounted and dead rather than being unmounted — which
   * makes this a *better* control than the one intended, because the canvas
   * element, its layout and the whole component tree are then identical in
   * both arms and the only difference left is the frames. (That
   * `CanvasBoundary` cannot catch the failure its own comment describes is a
   * real defect in BookingHero, recorded in ADR 0004 as out of scope here.)
   *
   * '2d' is let through on purpose: `ParticleField`'s Canvas 2D rAF loop is
   * the hero's other animated layer, and it has to be running identically in
   * both arms for the difference to be the 3D scene.
   */
  const original = HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.getContext = function patched(
    this: HTMLCanvasElement,
    id: string,
    ...rest: unknown[]
  ) {
    if (id === 'webgl' || id === 'webgl2' || id === 'experimental-webgl') return null;
    return (original as (...args: unknown[]) => unknown).apply(this, [id, ...rest]);
  } as typeof HTMLCanvasElement.prototype.getContext;
}

type Arm = 'full' | 'control' | 'reduced';

interface Harness {
  context: BrowserContext;
  page: Page;
  /** Console output *and* uncaught errors — the control's proof arrives as
   *  an unhandled rejection, which Chromium reports as the latter. */
  pageMessages: string[];
}

async function openArm(
  browser: Browser,
  baseURL: string,
  arm: Arm,
  cpuRate: number,
): Promise<Harness> {
  /*
   * The device is declared here rather than in the config's project `use`.
   * Each arm needs its own context — one overrides `reducedMotion`, another
   * installs an extra init script, and neither can be changed after a
   * context exists — and `browser.newContext()` does not inherit a project's
   * options. Both arms of every comparison therefore come out of this one
   * call, which is what makes them comparable at all.
   */
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 375, height: 812 },
    baseURL,
    reducedMotion: arm === 'reduced' ? 'reduce' : 'no-preference',
  });

  const pageMessages: string[] = [];
  const page = await context.newPage();
  page.on('console', (message) => pageMessages.push(message.text()));
  page.on('pageerror', (error) => pageMessages.push(error.message));

  await page.addInitScript(instrumentPage, LONG_FRAME_MS);
  if (arm === 'control') await page.addInitScript(suppressWebgl);

  // The public booking page fetches from the browser, so this is intercepted
  // rather than served from demo-mode fixtures — same approach as
  // booking.spec.ts, and identical in every arm.
  await page.route('**/api/v1/public/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(classPayload()),
    });
  });

  // Before the navigation: throttling applied after first paint would miss
  // the hero mounting, which is most of what is being measured.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', CELLULAR_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });

  return { context, page, pageMessages };
}

async function readProbe(page: Page): Promise<HeroProbe> {
  return page.evaluate(() => {
    const probe = (window as unknown as ProbeWindow).__heroProbe;
    return { ...probe };
  });
}

/** The class list has rendered and is tappable. 6x CPU needs the patience. */
async function waitForClassList(page: Page) {
  await expect(page.getByRole('button', { name: /Bento cake decorating/ })).toBeEnabled({
    timeout: 120_000,
  });
}

/**
 * The subject is actually on screen and actually drawing.
 *
 * Without this the whole file is vacuous, and that is not hypothetical: the
 * first version of this spec ran against the dev server at 6x and the full
 * arm recorded zero draws, zero dropped frames and a tap-to-form within 3%
 * of the control, because the lazily imported `Hero3D` chunk never finished
 * loading inside the window. Every comparison below is only meaningful once
 * this has passed, so it runs before each of them.
 *
 * Exactly two canvases in the header: `ParticleField` and `Hero3D`, which at
 * HEAD are the only two canvases anywhere under `components/public` that can
 * be mounted at scroll 0. This count does not separate the arms — the
 * control's canvas is mounted too, just dead (see `suppressWebgl`) — it
 * catches `Hero3D` not mounting at all, which is a different failure and the
 * one that made the first version of this file vacuous.
 */
async function expectHeroMounted(page: Page) {
  await expect(page.locator('header canvas')).toHaveCount(2, { timeout: 60_000 });

  const effectiveType = await page.evaluate(
    () =>
      (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
        ?.effectiveType ?? 'unknown',
  );
  expect(
    effectiveType,
    'the throttle profile must not trip useMayAnimate’s 2g check, which would unmount the subject',
  ).not.toMatch(/^(slow-)?2g$/);

  await expect
    .poll(async () => (await readProbe(page)).draws, { timeout: 60_000 })
    .toBeGreaterThan(0);
}

/**
 * The control arm really is the full arm minus its frames.
 *
 * Two canvases, same as `full`: ParticleField's, and Hero3D's — mounted,
 * laid out, and permanently blank. Then the two halves that make it a
 * control rather than a broken page: `three` got far enough to try to build
 * a renderer and failed for the one reason this arm arranges, and not a
 * single frame was submitted.
 */
async function expectHeroSuppressed(page: Page, pageMessages: string[]) {
  await expect(page.locator('header canvas')).toHaveCount(2, { timeout: 60_000 });

  await expect
    .poll(() => pageMessages.join('\n'), { timeout: 60_000 })
    .toContain('Error creating WebGL context');

  expect((await readProbe(page)).draws, 'the control must not draw a single WebGL frame').toBe(0);
}

interface FrameWindow {
  frames: number;
  longFrames: number;
  longFrameRatio: number;
  drawsInWindow: number;
}

async function measureFrames(page: Page, ms: number): Promise<FrameWindow> {
  const drawsBefore = (await readProbe(page)).draws;

  await page.evaluate(() => {
    const probe = (window as unknown as ProbeWindow).__heroProbe;
    probe.frames = 0;
    probe.longFrames = 0;
    probe.recording = true;
  });

  await page.waitForTimeout(ms);

  const after = await page.evaluate(() => {
    const probe = (window as unknown as ProbeWindow).__heroProbe;
    probe.recording = false;
    return { ...probe };
  });

  // A denominator, asserted rather than assumed: an arm that delivered no
  // frames at all has not produced a ratio, it has produced a 0/0 that would
  // read as whatever the next line wanted it to.
  expect(after.frames, 'the rAF chain must have run inside the window').toBeGreaterThan(10);

  return {
    frames: after.frames,
    longFrames: after.longFrames,
    longFrameRatio: after.longFrames / after.frames,
    drawsInWindow: after.draws - drawsBefore,
  };
}

test.describe('the 3D hero on slow hardware', () => {
  /**
   * Locks "the form does not wait for the hero", and nothing stronger.
   *
   * Deliberately low sensitivity: at 6x both arms are dominated by the same
   * ~2s of fixed bundle cost, so this would not notice the hero's *load*
   * cost doubling. What it does catch is the regression that would actually
   * matter to a guest — the 3D layer becoming something the booking form is
   * gated on, by being awaited, suspended on, or moved out of
   * `next/dynamic`.
   */
  test('the booking form is not gated on the hero', async ({ browser, baseURL }) => {
    const load: Partial<Record<Arm, number>> = {};

    for (const arm of ['reduced', 'full'] as const) {
      const harness = await openArm(browser, baseURL!, arm, SLOW_CPU);

      const started = Date.now();
      await harness.page.goto(`/book/${SLUG}`);
      await waitForClassList(harness.page);
      load[arm] = Date.now() - started;

      if (arm === 'full') {
        await expectHeroMounted(harness.page);
      } else {
        // Reduced motion suppresses ParticleField too, so this arm has no
        // canvas at all — which is also the proof the arm is what it says.
        await expect(harness.page.locator('header canvas')).toHaveCount(0);
      }

      await harness.context.close();
    }

    const ratio = load.full! / load.reduced!;
    console.log(
      `[hero-perf] time to an interactive class list @${SLOW_CPU}x — full ${load.full}ms, reduced ${load.reduced}ms, ratio ${ratio.toFixed(2)}`,
    );

    expect(ratio).toBeLessThanOrEqual(1.25);
  });

  /**
   * The headline number: how much of the frame budget the hero burns while
   * the guest is doing nothing, and the proof that cost is the CPU's.
   *
   * At rest, scroll 0, the control is `ParticleField`'s 2D rAF loop plus the
   * CSS keyframes — the hero's whole surroundings, minus the hero. The ratio
   * between the two arms' dropped-frame fractions is the hero.
   *
   * The 1x arm is not a nicety. Headless Chromium rasterizes on the CPU in
   * the GPU process, which `setCPUThrottlingRate` does not throttle; if the
   * cost were rasterization it would be there at 1x too. It is asserted, not
   * described, because a comment making that argument is a comment someone
   * will delete.
   */
  test('the hero drops frames at rest on a slow CPU, and does not on a fast one', async ({
    browser,
    baseURL,
  }) => {
    const measured: Record<string, FrameWindow> = {};

    for (const rate of [SLOW_CPU, FAST_CPU]) {
      for (const arm of ['full', 'control'] as const) {
        const harness = await openArm(browser, baseURL!, arm, rate);
        await harness.page.goto(`/book/${SLUG}`);
        await waitForClassList(harness.page);

        if (arm === 'full') await expectHeroMounted(harness.page);
        else await expectHeroSuppressed(harness.page, harness.pageMessages);

        const sample = await measureFrames(harness.page, FRAME_WINDOW_MS);
        measured[`${arm}@${rate}`] = sample;

        console.log(
          `[hero-perf] ${arm}@${rate}x at rest — ${sample.longFrames}/${sample.frames} frames over ${LONG_FRAME_MS}ms (${(sample.longFrameRatio * 100).toFixed(1)}%), ${sample.drawsInWindow} draws in the window`,
        );

        await harness.context.close();
      }
    }

    const slowFull = measured[`full@${SLOW_CPU}`]!;
    const slowControl = measured[`control@${SLOW_CPU}`]!;
    const fastFull = measured[`full@${FAST_CPU}`]!;
    const fastControl = measured[`control@${FAST_CPU}`]!;

    /*
     * The frameloop ran *through* the window.
     *
     * `draws > 0` — which `expectHeroMounted` already checks — only proves a
     * draw call happened at some point. Hero3D sets `frameloop={onScreen ?
     * 'always' : 'never'}` from `useIsOnScreen`, so any future change that
     * leaves `onScreen` false after first paint would give draws from the
     * opening frames, zero long frames in the window, and a separation
     * assertion that passes with nothing animating. 60 draws is 12 frames of
     * a five-mesh scene over 2.5s — roughly 5fps, far under anything healthy
     * and far over a scene that stopped.
     */
    expect(slowFull.drawsInWindow, 'the hero must still be animating at 6x').toBeGreaterThanOrEqual(
      60,
    );
    expect(fastFull.drawsInWindow, 'the hero must still be animating at 1x').toBeGreaterThanOrEqual(
      60,
    );
    expect(slowControl.drawsInWindow).toBe(0);
    expect(fastControl.drawsInWindow).toBe(0);

    /*
     * The separation, stated two ways because either alone is satisfiable by
     * zero.
     *
     * `>= 5x the control` is the transferable half — both arms measured on
     * this machine, in this test — but the control at rest legitimately
     * drops nothing, and `x >= 5 * 0` is `x >= 0`. The clamp at 0.01 stops
     * that, and the floor underneath it is what actually says "the hero
     * drops frames": 0.08 is a dimensionless fraction, not a millisecond
     * count, so unlike an absolute threshold it transfers to another runner.
     * Measured 0.21–0.28 at 6x, so the floor has room for a slower machine
     * without having room for a scene that stopped.
     */
    expect(slowFull.longFrameRatio).toBeGreaterThanOrEqual(
      5 * Math.max(slowControl.longFrameRatio, 0.01),
    );
    expect(slowFull.longFrameRatio).toBeGreaterThanOrEqual(0.08);
    expect(slowControl.longFrameRatio).toBeLessThanOrEqual(0.03);

    /*
     * And it is the CPU. At 1x the two arms must be indistinguishable —
     * stated as a ratio *and* a ceiling, the same shape as above, so that a
     * loaded runner which degrades both arms together fails neither. If the
     * hero's cost were SwiftShader rasterization or the `maskImage` +
     * `mix-blend-overlay` compositing above it, this is where it would show
     * up, and the inference in ADR 0004 would be wrong.
     */
    expect(fastFull.longFrameRatio).toBeLessThanOrEqual(
      3 * Math.max(fastControl.longFrameRatio, 0.01),
    );
    expect(fastFull.longFrameRatio).toBeLessThanOrEqual(0.05);
  });

  /**
   * What it costs the guest: how long the form takes to appear after the tap
   * that asks for it, with the hero animating versus not.
   *
   * This is a **characterisation floor**, not a regression ceiling, and the
   * direction is the point. It records today's defect. When the bail-out
   * this measurement argues for lands, this test will go red — and that is
   * the signal to re-measure and rewrite the number, never to widen it. A
   * ceiling here would be a number that proves less every time someone
   * relaxes it.
   *
   * Honest about its confound: the tap happens at scroll 0, where
   * `CeramicShowcase` has not mounted (`useRevealOnScroll`, threshold 0.15),
   * and the step 1 → 2 commit drops the brand sections before the heading's
   * focus scrolls anything. So this path really is the hero alone. A
   * *scroll*-to-form measurement would not be: it crosses `CeramicShowcase`
   * at ~300px and mounts a second WebGL scene, and a `getContext` control
   * cannot suppress one without suppressing the other. That is why there
   * isn't one here.
   */
  test('the animating hero starves the tap that opens the form', async ({ browser, baseURL }) => {
    const tapToForm: Partial<Record<Arm, number>> = {};

    for (const arm of ['full', 'control'] as const) {
      const harness = await openArm(browser, baseURL!, arm, SLOW_CPU);
      await harness.page.goto(`/book/${SLUG}`);
      await waitForClassList(harness.page);

      if (arm === 'full') await expectHeroMounted(harness.page);
      else await expectHeroSuppressed(harness.page, harness.pageMessages);

      const started = Date.now();
      await harness.page.getByRole('button', { name: /Bento cake decorating/ }).click();
      await expect(harness.page.getByLabel(/Your name/)).toBeVisible({ timeout: 120_000 });
      tapToForm[arm] = Date.now() - started;

      await harness.context.close();
    }

    const ratio = tapToForm.full! / tapToForm.control!;
    console.log(
      `[hero-perf] tap to an interactive form @${SLOW_CPU}x — full ${tapToForm.full}ms, control ${tapToForm.control}ms, ratio ${ratio.toFixed(1)}x`,
    );

    expect(ratio).toBeGreaterThanOrEqual(4);
  });
});
