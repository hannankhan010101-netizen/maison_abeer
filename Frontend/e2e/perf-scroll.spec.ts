import { devices, expect, test } from '@playwright/test';

import { stubBookingApi, threeCrafts } from './helpers/booking';

/**
 * The booking page scrolls smoothly on a phone.
 *
 * This replaces `hero-perf.spec.ts`, which measured the cost of a 3D hero that
 * no longer exists. What matters now is the whole page: the backdrop, the
 * stickers, the photographs, the scroll story and the aurora all run at once,
 * on a phone, for a guest on mobile data who arrived from an advert.
 *
 * It runs under `playwright.perf.config.ts`, which builds and serves a
 * *production* bundle — a dev server measures nothing (it ships unminified code
 * and a hot-reload client). The CPU is throttled four times (roughly a mid-range
 * phone), every lazy section is woken once so the measured run is not dominated
 * by first loads, and then a scripted scroll plus an idle stretch are timed
 * frame by frame.
 *
 * Phone only on purpose. Headless desktop Chromium rasterises on the CPU, so its
 * frame times at 1280px are noise; the phone viewport is steady (measured:
 * 16.7ms a frame, no frame over 33ms, with the whole page and with the baseline
 * before this redesign). The budgets below are generous against that and tight
 * against a real regression — and `PERF_THROTTLE` lets anyone prove the test can
 * fail by raising it.
 */

const THROTTLE = Number(process.env['PERF_THROTTLE'] ?? 4);

/** Budgets, against a measured 16.7ms / 0 slow frames / 0ms long tasks. */
const BUDGET = {
  p95FrameMs: 25,
  slowFrameShare: 0.03, // frames over 33ms (two missed vsyncs), as a share of all frames
  longTaskMs: 200,
  idleAvgFrameMs: 20,
};

test.use({ ...devices['Pixel 7'], viewport: { width: 375, height: 812 } });

test('scrolling the whole booking page stays smooth on a throttled phone', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __long: number }).__long = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as unknown as { __long: number }).__long += entry.duration;
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      // Long-task timing is Chromium-only; this project is Chromium.
    }
  });
  await stubBookingApi(page, threeCrafts());

  await page.goto('/book/maison-abeer', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Wake every lazy section once, un-throttled.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 400) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

  const result = await page.evaluate(async () => {
    const w = window as unknown as { __long: number };
    const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

    async function sample(ms: number, step: number) {
      const deltas: number[] = [];
      let last = await frame();
      const end = performance.now() + ms;
      while (performance.now() < end) {
        if (step) window.scrollBy(0, step);
        const now = await frame();
        deltas.push(now - last);
        last = now;
      }
      return deltas;
    }

    const summarise = (deltas: number[]) => {
      const sorted = [...deltas].sort((a, b) => a - b);
      return {
        frames: deltas.length,
        avg: deltas.reduce((a, b) => a + b, 0) / deltas.length,
        p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        slow: deltas.filter((delta) => delta > 33.4).length,
      };
    };

    w.__long = 0;
    const scroll = summarise(await sample(6000, 14));
    const longTaskMs = Math.round(w.__long);

    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const idle = summarise(await sample(3000, 0));

    return { scroll, longTaskMs, idle };
  });

  const note = JSON.stringify(result);

  expect(result.scroll.p95, `p95 frame time while scrolling: ${note}`).toBeLessThanOrEqual(
    BUDGET.p95FrameMs,
  );
  expect(
    result.scroll.slow / result.scroll.frames,
    `share of frames over 33ms while scrolling: ${note}`,
  ).toBeLessThanOrEqual(BUDGET.slowFrameShare);
  expect(result.longTaskMs, `long-task time while scrolling: ${note}`).toBeLessThanOrEqual(
    BUDGET.longTaskMs,
  );
  expect(result.idle.avg, `average idle frame time: ${note}`).toBeLessThanOrEqual(
    BUDGET.idleAvgFrameMs,
  );
});
