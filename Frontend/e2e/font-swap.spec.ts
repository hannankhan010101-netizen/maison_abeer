import { statSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * The storefront's headline face (Fraunces) arriving late must not move the
 * page.
 *
 * The hero is in the server HTML, so it paints in the fallback face first.
 * Here the font is made late on purpose: every request for the Fraunces file
 * is held for 2.5 s, on top of Slow 4G and a 4x slower CPU. The page is loaded
 * cold at each phone and tablet width and the layout shifts without recent
 * input are summed; the sum must stay under 0.05.
 *
 * next/font serves the file under a hashed name, so it is recognised by its
 * size: next/font/local copies the file byte for byte.
 *
 * Runs only under `playwright.fontswap.config.ts` (`npm run test:e2e:fontswap`).
 */

test.skip(process.env['MAISON_FONTSWAP_E2E'] !== '1', 'font-swap only: npm run test:e2e:fontswap');

const PAGE = '/book/maison-abeer';
const FONT_DELAY_MS = 2500;
const SETTLE_MS = 3000;
const WIDTHS = [320, 375, 412, 768] as const;
const FRAUNCES_BYTES = statSync(
  path.join(__dirname, '..', 'src', 'fonts', 'fraunces-variable.woff2'),
).size;

interface Shift {
  value: number;
  atMs: number;
  sources: string[];
}

declare global {
  interface Window {
    __swap?: { cls: number; shifts: Shift[] };
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

for (const width of WIDTHS) {
  test(`a late Fraunces does not shift the page at ${width}px`, async ({ page, request }) => {
    // Warm the server's own cache, so the run measures the browser.
    expect((await request.get(PAGE)).ok()).toBe(true);
    await page.setViewportSize({ width, height: 823 });

    let held = 0;
    await page.route('**/*.woff2', async (route) => {
      const response = await route.fetch();
      const body = await response.body();
      if (body.length === FRAUNCES_BYTES) {
        held += 1;
        await new Promise((resolve) => setTimeout(resolve, FONT_DELAY_MS));
      }
      await route.fulfill({ response, body });
    });

    await page.addInitScript(() => {
      const swap = { cls: 0, shifts: [] as Shift[] };
      window.__swap = swap;
      const describe = (node: Node | null) => {
        const el = node instanceof Element ? node : (node?.parentElement ?? null);
        if (!el) return '(no node)';
        const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
        return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
      };
      const box = (r: DOMRectReadOnly) =>
        `${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: {
            node: Node | null;
            previousRect: DOMRectReadOnly;
            currentRect: DOMRectReadOnly;
          }[];
        })[]) {
          if (entry.hadRecentInput) continue;
          swap.cls += entry.value;
          swap.shifts.push({
            value: Number(entry.value.toFixed(4)),
            atMs: Math.round(entry.startTime),
            sources: (entry.sources ?? []).map(
              (s) => `${describe(s.node)} (${box(s.previousRect)}) -> (${box(s.currentRect)})`,
            ),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    await throttle(page);
    await page.goto(PAGE, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(SETTLE_MS);

    const result = await page.evaluate(() => window.__swap ?? { cls: 0, shifts: [] });
    const cls = Number(result.cls.toFixed(4));
    console.log(`font-swap ${width}px: CLS ${cls}, Fraunces requests held ${held}`);
    for (const shift of [...result.shifts].sort((a, b) => b.value - a.value).slice(0, 3)) {
      console.log(`  shift ${shift.value} at ${shift.atMs} ms: ${shift.sources.join('; ')}`);
    }

    expect(held, 'the Fraunces file was never requested, so nothing was held').toBeGreaterThan(0);
    expect(cls, `cold CLS at ${width}px with Fraunces held ${FONT_DELAY_MS} ms`).toBeLessThan(0.05);
  });
}
