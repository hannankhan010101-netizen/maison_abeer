import { afterEach, describe, expect, it, vi } from 'vitest';

import { withViewTransition } from './viewTransition';

/**
 * A view transition photographs the page, runs the update, photographs it again
 * and animates between the two. Where the browser cannot, or the guest asked
 * for less motion, the same update must still happen — just without the show.
 */

// lib.dom declares `startViewTransition` as always present; a test needs to
// remove and replace it, as an older browser would never have had it.
type Doc = { startViewTransition?: unknown };
const doc = document as unknown as Doc;

function media(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? reduced : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  delete doc.startViewTransition;
  vi.unstubAllGlobals();
});

describe('withViewTransition', () => {
  it('runs the update inside the browser’s transition, exactly once', async () => {
    media(false);
    const update = vi.fn();
    const order: string[] = [];
    doc.startViewTransition = vi.fn((callback: () => void) => {
      order.push('start');
      callback();
      order.push('callback-done');
      return { finished: Promise.resolve() };
    });

    await withViewTransition(() => {
      order.push('update');
      update();
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['start', 'update', 'callback-done']);
  });

  it('just runs the update, at once, where the browser has no view transitions', async () => {
    media(false);
    const update = vi.fn();

    const done = withViewTransition(update);

    // Synchronously — before the returned promise has had a chance to settle.
    expect(update).toHaveBeenCalledTimes(1);
    await done;
  });

  it('skips the transition when motion is unwelcome, even if the browser has it', async () => {
    media(true);
    const startViewTransition = vi.fn();
    doc.startViewTransition = startViewTransition;
    const update = vi.fn();

    await withViewTransition(update);

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('swallows the AbortError a newer transition causes, because the update still happened', async () => {
    media(false);
    const update = vi.fn();
    doc.startViewTransition = vi.fn((callback: () => void) => {
      callback();
      return { finished: Promise.reject(new DOMException('Skipped', 'AbortError')) };
    });

    await expect(withViewTransition(update)).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
