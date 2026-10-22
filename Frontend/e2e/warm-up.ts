import type { FullConfig } from '@playwright/test';

/**
 * Compile the storefront once, before any test runs.
 *
 * `next dev` compiles a route the first time it is asked for it, and tells the
 * browser to reload when it finishes. The storefront is a big page, so on a busy
 * machine that first compile can outlast a whole test's budget, and the first
 * test to arrive fails with `net::ERR_ABORTED` for a reason that has nothing to
 * do with what it checks. A plain request from here pays that cost once, with
 * time to spare, and every test after it finds the page ready.
 */
const PAGES = ['/book/maison-abeer'];

export default async function warmUp(config: FullConfig): Promise<void> {
  const base = config.projects[0]?.use.baseURL;
  if (!base) return;

  for (const path of PAGES) {
    try {
      await fetch(new URL(path, base), { signal: AbortSignal.timeout(170_000) });
    } catch {
      // A failed warm-up only means the first test pays the cost, as it did before.
    }
  }
}
