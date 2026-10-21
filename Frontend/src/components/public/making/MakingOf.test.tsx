import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    const body = container.querySelector('.making__stage [data-making-body]');
    const bodyMorphs = timeline.to.mock.calls.filter((call) => (call as unknown[])[0] === body);
    expect(bodyMorphs).toHaveLength(3);

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

describe('MakingOf artwork', () => {
  it('draws the wheel and the ground shadow in every strip frame, hidden from screen readers', () => {
    media({ reduced: true, wide: true });
    const { container } = render(<MakingOf />);

    const frames = container.querySelectorAll('figure');
    expect(frames).toHaveLength(4);
    frames.forEach((frame) => {
      expect(frame.querySelector('[data-making-wheel]')).not.toBeNull();
      expect(frame.querySelector('[data-making-shadow]')).not.toBeNull();
      expect(frame.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('shows the opening rim only on the hollow stages, and throwing lines only on the vase', () => {
    media({ reduced: true, wide: true });
    const { container } = render(<MakingOf />);

    const frames = Array.from(container.querySelectorAll('figure'));
    expect(frames.map((f) => f.querySelector('[data-making-rim]') !== null)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(frames.map((f) => f.querySelector('[data-making-lines]') !== null)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it('fades the rim and lines in on the pinned stage as well as morphing the body', async () => {
    media({ reduced: false, wide: true });
    const { kit, timeline } = fakeKit();
    load.mockResolvedValue(kit as never);

    const { container } = render(<MakingOf />);
    await waitFor(() => expect(timeline.to).toHaveBeenCalled());

    const stage = container.querySelector('.making__stage')!;
    expect(stage.getAttribute('aria-hidden')).toBe('true');
    const targets = timeline.to.mock.calls.map((call) => (call as unknown[])[0]);
    expect(targets.length).toBe(6);
    expect(targets.includes(stage.querySelector('[data-making-rim]'))).toBe(true);
    expect(targets.includes(stage.querySelector('[data-making-lines]'))).toBe(true);
  });

  it('uses palette tokens only: no raw hex colours in the artwork sources', () => {
    const files = [
      'components/public/making/MakingOf.tsx',
      'components/public/making/makingStages.ts',
      'styles/units/making.css',
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), 'src', file), 'utf8');
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
