import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * ScrollTrigger calls `window.matchMedia` while it registers, and jsdom has
 * none. Real browsers do; this is the smallest stand-in that lets the real
 * library run.
 */
function stubMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

afterEach(() => {
  vi.doUnmock('gsap/Flip');
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('loadGsap', () => {
  it('returns gsap and the plugins asked for, already registered', async () => {
    stubMatchMedia();
    const { loadGsap } = await import('./gsap');

    const kit = await loadGsap('Flip', 'ScrollTrigger');

    expect(kit).not.toBeNull();
    expect(typeof kit!.gsap.to).toBe('function');
    expect(typeof kit!.ScrollTrigger.create).toBe('function');
    // Registered, which is observable: Flip throws ("_toArray is not a function")
    // if it was loaded but never registered, and works once it has been.
    expect(() => kit!.Flip.getState([])).not.toThrow();
  });

  it('hands every caller the same load, whatever order the plugins are named in', async () => {
    stubMatchMedia();
    const { loadGsap } = await import('./gsap');

    const first = loadGsap('Flip', 'ScrollTrigger');
    const second = loadGsap('ScrollTrigger', 'Flip');
    const third = loadGsap('Flip', 'Flip', 'ScrollTrigger');

    expect(second).toBe(first);
    expect(third).toBe(first);

    // Let the real load finish before the test ends: the cleanup removes the
    // `matchMedia` stub, and a load still registering plugins would then fail
    // and warn after the test is over.
    await expect(first).resolves.not.toBeNull();
  });

  it('resolves null — never rejects — when a plugin fails to load, and says so once', async () => {
    vi.resetModules();
    vi.doMock('gsap/Flip', () => {
      throw new Error('chunk failed to load');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { loadGsap } = await import('./gsap');

    await expect(loadGsap('Flip')).resolves.toBeNull();
    // Asking again is the same answer, not a second warning or a second attempt.
    await expect(loadGsap('Flip')).resolves.toBeNull();

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
