import type { Page } from '@playwright/test';

/**
 * Below-the-fold sections load as islands: their code is fetched when they come
 * within a screen or so of the viewport, so a test that goes straight to
 * `.memory-wall` finds a placeholder. This scrolls each placeholder into range
 * in turn and waits for it to load (a loaded one is marked `data-loaded`), then
 * returns to the top. Sections load as the page is read, so each one's height
 * settles before the next is looked for.
 */
export async function loadAllSections(page: Page, { timeout = 15_000 }: { timeout?: number } = {}) {
  const deadline = Date.now() + timeout;

  // The sections exist only once the classes have arrived. A page with none
  // (a studio with no classes, a step past the first) simply has nothing to load.
  await page
    .waitForSelector('[data-lazy-section]', { state: 'attached', timeout: 8_000 })
    .catch(() => {});

  for (;;) {
    const next = await page.evaluate(() => {
      const pending = document.querySelector('[data-lazy-section]:not([data-loaded])');
      if (!pending) return null;
      const top = pending.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.max(0, top - 300));
      return pending.getAttribute('data-lazy-section');
    });

    if (next === null) break;

    if (Date.now() > deadline) {
      throw new Error(`the lazy section "${next}" did not load within ${timeout} ms`);
    }

    // Give the observer a frame to fire and the chunk a moment to arrive.
    await page
      .waitForFunction(
        (label) =>
          document.querySelector(`[data-lazy-section="${label}"][data-loaded]`) !== null ||
          document.querySelector(`[data-lazy-section="${label}"]:not([data-loaded])`) === null,
        next,
        { timeout: 5_000 },
      )
      .catch(() => {});
  }

  await page.evaluate(() => window.scrollTo(0, 0));
}
