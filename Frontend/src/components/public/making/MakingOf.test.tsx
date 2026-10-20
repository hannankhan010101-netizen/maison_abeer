import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MakingOf } from './MakingOf';
import { MAKING_STAGES } from './makingStages';

vi.mock('@/lib/motion/gsap', () => ({ loadGsap: vi.fn() }));

import { loadGsap } from '@/lib/motion/gsap';

const load = vi.mocked(loadGsap);

function media({ reduced, wide }: { reduced: boolean; wide: boolean }) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? reduced : query.includes('min-width') ? wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function fakeKit() {
  const trigger = { kill: vi.fn() };
  const timeline = { to: vi.fn(), kill: vi.fn() };
  timeline.to.mockReturnValue(timeline);
  const gsap = {
    timeline: vi.fn(() => timeline),
    set: vi.fn(),
    to: vi.fn(() => ({ kill: vi.fn() })),
  };
  const ScrollTrigger = { create: vi.fn(() => trigger) };
  return {
    kit: { gsap, ScrollTrigger, MorphSVGPlugin: {} },
    gsap,
    ScrollTrigger,
    trigger,
    timeline,
  };
}

function captionsPresent(container: HTMLElement) {
  for (const stage of MAKING_STAGES) {
    expect(container.textContent).toContain(stage.caption);
  }
}

beforeEach(() => load.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('MakingOf', () => {
  it('shows all four captioned frames and nothing pinned under reduced motion', async () => {
    media({ reduced: true, wide: true });
    const { container } = render(<MakingOf />);

    captionsPresent(container);
    expect(container.querySelectorAll('figcaption')).toHaveLength(4);
    expect(container.querySelector('[data-pinned]')).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps the static strip when the library could not be loaded', async () => {
    media({ reduced: false, wide: true });
    load.mockResolvedValue(null);
    const { container } = render(<MakingOf />);

    await waitFor(() => expect(load).toHaveBeenCalledWith('ScrollTrigger', 'MorphSVGPlugin'));
    captionsPresent(container);
    expect(container.querySelector('[data-pinned]')).toBeNull();
  });

  it('pins and scrubs from 768px up, and lets go on unmount', async () => {
    media({ reduced: false, wide: true });
    const { kit, ScrollTrigger, trigger, timeline } = fakeKit();
    load.mockResolvedValue(kit as never);

    const { container, unmount } = render(<MakingOf />);

    await waitFor(() => expect(ScrollTrigger.create).toHaveBeenCalledTimes(1));
    expect(ScrollTrigger.create).toHaveBeenCalledWith(
      expect.objectContaining({ end: '+=250%', scrub: 0.6, pin: true }),
    );
    expect(container.querySelector('section[data-pinned]')).not.toBeNull();
    captionsPresent(container);
    // One path morphs through the three changes between four stages.
    expect(timeline.to).toHaveBeenCalledTimes(3);

    unmount();
    expect(trigger.kill).toHaveBeenCalled();
    expect(timeline.kill).toHaveBeenCalled();
  });

  it('does not pin below 768px', async () => {
    media({ reduced: false, wide: false });
    const { kit, ScrollTrigger } = fakeKit();
    load.mockResolvedValue(kit as never);

    const { container } = render(<MakingOf />);

    await waitFor(() => expect(load).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ScrollTrigger.create).not.toHaveBeenCalled();
    expect(container.querySelector('[data-pinned]')).toBeNull();
    captionsPresent(container);
  });
});
