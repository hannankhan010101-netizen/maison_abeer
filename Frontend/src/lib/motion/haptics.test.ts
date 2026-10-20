import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { haptic } from './haptics';

/**
 * A buzz is feedback for a thumb, so it is only ever sent to a touch device,
 * never when motion is unwelcome, and never where the browser has no way to
 * (iOS Safari). Each of those is a way to buzz someone who did not want it.
 */

let vibrate: ReturnType<typeof vi.fn>;

function media(overrides: Record<string, boolean>) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: overrides[query] ?? false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  vibrate = vi.fn(() => true);
  vi.stubGlobal('navigator', { ...navigator, vibrate });
});

afterEach(() => vi.unstubAllGlobals());

describe('haptic', () => {
  it('taps with a single short pulse on a touch screen', () => {
    media({ '(pointer: coarse)': true });
    haptic('tap');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it('celebrates success with a three-part pattern', () => {
    media({ '(pointer: coarse)': true });
    haptic('success');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([12, 40, 18]);
  });

  it('is silent when motion is unwelcome', () => {
    media({ '(pointer: coarse)': true, '(prefers-reduced-motion: reduce)': true });
    haptic('tap');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('is silent on a device with a mouse, where there is no thumb to buzz', () => {
    media({ '(pointer: coarse)': false });
    haptic('success');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('does nothing, without throwing, where the browser cannot vibrate', () => {
    vi.stubGlobal('navigator', { ...navigator, vibrate: undefined });
    media({ '(pointer: coarse)': true });
    expect(() => haptic('tap')).not.toThrow();
  });
});
