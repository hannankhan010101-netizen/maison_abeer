import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useScrollParallax } from './useScrollParallax';

vi.mock('@/lib/motion/gsap', () => ({ loadGsap: vi.fn() }));

import { loadGsap } from '@/lib/motion/gsap';

const load = vi.mocked(loadGsap);

function Probe() {
  const ref = useScrollParallax<HTMLDivElement>(7);

  return (
    <div data-parallax-frame data-testid="frame">
      <div ref={ref} data-testid="image" />
    </div>
  );
}

function media(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? reduced : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function fakeKit() {
  const scrollTrigger = { kill: vi.fn() };
  const tween = { scrollTrigger, kill: vi.fn() };
  const gsap = { fromTo: vi.fn(() => tween), set: vi.fn() };

  return { kit: { gsap, ScrollTrigger: {} }, tween, scrollTrigger, gsap };
}

beforeEach(() => load.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('useScrollParallax', () => {
  it('asks the shared loader for ScrollTrigger, and drifts the image inside its frame', async () => {
    media(false);
    const { kit, gsap } = fakeKit();
    load.mockResolvedValue(kit as never);

    const { getByTestId } = render(<Probe />);

    await waitFor(() => expect(gsap.fromTo).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledWith('ScrollTrigger');
    expect(gsap.fromTo).toHaveBeenCalledWith(
      getByTestId('image'),
      { yPercent: -7 },
      expect.objectContaining({
        yPercent: 7,
        scrollTrigger: expect.objectContaining({ trigger: getByTestId('frame'), scrub: 0.6 }),
      }),
    );
  });

  it('leaves the image alone when the library could not be loaded', async () => {
    media(false);
    load.mockResolvedValue(null);

    const { getByTestId } = render(<Probe />);

    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(getByTestId('image').getAttribute('style')).toBeNull();
  });

  it('lets go of the trigger and the tween when it unmounts', async () => {
    media(false);
    const { kit, gsap, tween, scrollTrigger } = fakeKit();
    load.mockResolvedValue(kit as never);

    const { unmount } = render(<Probe />);
    await waitFor(() => expect(gsap.fromTo).toHaveBeenCalled());

    unmount();

    expect(scrollTrigger.kill).toHaveBeenCalledTimes(1);
    expect(tween.kill).toHaveBeenCalledTimes(1);
  });

  it('never loads the library for a guest who asked for less motion', async () => {
    media(true);

    render(<Probe />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(load).not.toHaveBeenCalled();
  });
});
