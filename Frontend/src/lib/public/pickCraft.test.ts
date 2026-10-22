import { afterEach, describe, expect, it, vi } from 'vitest';

import { onCraftFilterRequest, PICK_CRAFT_EVENT, requestCraftFilter } from './pickCraft';

/**
 * A small signal from one part of the page to another: "the guest wants this
 * craft". The quiz's "Book this one" sends it, and the class list, which owns
 * its own filter, listens. Neither imports the other.
 */

afterEach(() => vi.restoreAllMocks());

describe('the craft filter request', () => {
  it('reaches a listener with the craft', () => {
    const listener = vi.fn();
    const stop = onCraftFilterRequest(listener);

    requestCraftFilter('pottery');

    expect(listener).toHaveBeenCalledWith('pottery');
    stop();
  });

  it('stops reaching a listener once it has unsubscribed', () => {
    const listener = vi.fn();
    onCraftFilterRequest(listener)();

    requestCraftFilter('cake');

    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores an event that does not carry one of the three crafts', () => {
    const listener = vi.fn();
    const stop = onCraftFilterRequest(listener);

    window.dispatchEvent(new CustomEvent(PICK_CRAFT_EVENT, { detail: 'knitting' }));
    window.dispatchEvent(new CustomEvent(PICK_CRAFT_EVENT, { detail: null }));
    window.dispatchEvent(new CustomEvent(PICK_CRAFT_EVENT));

    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it('is safe where there is no window', () => {
    vi.stubGlobal('window', undefined);
    expect(() => requestCraftFilter('cake')).not.toThrow();
    expect(() => onCraftFilterRequest(() => {})()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
