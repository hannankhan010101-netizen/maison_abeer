import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * The booking page in the lab: a Moto G-class phone on Slow 4G with the CPU
 * slowed 4x, the conditions a guest arriving from an ad is likely to have.
 *
 * Runs only under `playwright.lab.config.ts` (`npm run test:e2e:lab`). Loads
 * `/book/maison-abeer` twice in one browser context: cold (empty cache), then
 * warm (a second visit). Writes both to `test-results/lab.json` and asserts on
 * the warm run only: LCP at most 1800 ms and CLS under 0.05. The cold run is
 * recorded, not asserted, until it has a baseline of its own.
 *
 * TBT here is the sum of each long task's time over 50 ms from navigation to
 * the read-out, a lab approximation of Lighthouse's FCP-to-TTI window.
 */

// Set by playwright.lab.config.ts: under the functional suite's dev server the numbers mean nothing.
test.skip(process.env['MAISON_LAB_E2E'] !== '1', 'lab only: npm run test:e2e:lab');

const PAGE = '/book/maison-abeer';
const SETTLE_MS = 3000;

interface LabRun {
  lcpMs: number;
  cls: number;
  tbtMs: number;
  transferBytes: number;
}

declare global {
  interface Window {
    __lab?: { lcp: number; cls: number; tbt: number };
  }
}

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (0.75 * 1024 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

async function measure(page: Page): Promise<LabRun> {
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForTimeout(SETTLE_MS);
  return page.evaluate(() => {
    const lab = window.__lab ?? { lcp: 0, cls: 0, tbt: 0 };
    const entries = [
      ...performance.getEntriesByType('navigation'),
      ...performance.getEntriesByType('resource'),
    ] as PerformanceResourceTiming[];
    return {
      lcpMs: Math.round(lab.lcp),
      cls: Number(lab.cls.toFixed(4)),
      tbtMs: Math.round(lab.tbt),
      transferBytes: entries.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
    };
  });
}

test('the booking page on a slow phone', async ({ page, request }) => {
  // Warm the server's own cache first, so both runs measure the browser, not a first render.
  expect((await request.get(PAGE)).ok()).toBe(true);

  await page.addInitScript(() => {
    const lab = { lcp: 0, cls: 0, tbt: 0 };
    window.__lab = lab;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) lab.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[]) {
        if (!entry.hadRecentInput) lab.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) lab.tbt += Math.max(0, entry.duration - 50);
    }).observe({ type: 'longtask', buffered: true });
  });

  await throttle(page);
  const cold = await measure(page);
  const warm = await measure(page);

  const result = { page: PAGE, conditions: 'Slow 4G, 4x CPU, 412x823 @2.6', cold, warm };
  const out = path.join(__dirname, '..', 'test-results', 'lab.json');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  for (const [name, run] of Object.entries({ cold, warm })) {
    console.log(
      `lab ${name}: LCP ${run.lcpMs} ms, CLS ${run.cls}, TBT ${run.tbtMs} ms, ${run.transferBytes} bytes`,
    );
  }

  expect.soft(warm.lcpMs, 'warm LCP (ms)').toBeLessThanOrEqual(1800);
  expect.soft(warm.cls, 'warm CLS').toBeLessThan(0.05);
});
