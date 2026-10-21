import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STICKER_PATHS, StickerMorph } from './StickerMorph';

const loadGsap = vi.hoisted(() => vi.fn());
vi.mock('@/lib/motion/gsap', () => ({ loadGsap }));

/**
 * The sticker is one path. Without motion, or without the GSAP kit, it is
 * simply the cake and nothing ever changes it.
 */

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let callbacks: Callback[] = [];
let observed: Element[] = [];

class FakeObserver {
  constructor(callback: Callback) {
    callbacks.push(callback);
  }
  observe(target: Element) {
    observed.push(target);
  }
  unobserve() {}
  disconnect() {}
}

function allowMotion(allowed: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: allowed ? false : query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function dOf(container: HTMLElement): string {
  const paths = container.querySelectorAll('svg path');
  expect(paths).toHaveLength(1);
  return paths[0]!.getAttribute('d')!;
}

beforeEach(() => {
  callbacks = [];
  observed = [];
  loadGsap.mockReset();
  loadGsap.mockResolvedValue(null);
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  document.body.innerHTML =
    '<article data-craft-chapter="pottery"></article><article data-craft-chapter="painting"></article><div id="mount"></div>';
});

afterEach(() => vi.unstubAllGlobals());

function renderSticker() {
  return render(<StickerMorph />, { container: document.getElementById('mount')! });
}

describe('StickerMorph', () => {
  it('draws the cake as a single outline path first', () => {
    allowMotion(true);
    const { container } = renderSticker();
    expect(dOf(container)).toBe(STICKER_PATHS.cake);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('stays on the first frame under reduced motion, and never loads the kit', async () => {
    allowMotion(false);
    const { container } = renderSticker();
    await act(async () => {});
    expect(loadGsap).not.toHaveBeenCalled();
    expect(observed).toHaveLength(0);
    expect(dOf(container)).toBe(STICKER_PATHS.cake);
  });

  it('stays on the first frame when the kit resolves null', async () => {
    allowMotion(true);
    loadGsap.mockResolvedValue(null);
    const { container } = renderSticker();
    await act(async () => {});
    expect(loadGsap).toHaveBeenCalledWith('MorphSVGPlugin');
    for (const callback of callbacks) {
      act(() => callback([{ target: observed[0]!, isIntersecting: true, intersectionRatio: 1 }]));
    }
    expect(dOf(container)).toBe(STICKER_PATHS.cake);
  });

  it('morphs to the pot, then the palette, as those chapters come into view', async () => {
    allowMotion(true);
    const to = vi.fn();
    loadGsap.mockResolvedValue({ gsap: { to } });
    renderSticker();
    await act(async () => {});

    expect(observed).toHaveLength(2);
    const show = (target: Element) =>
      act(() => callbacks[0]!([{ target, isIntersecting: true, intersectionRatio: 0.8 }]));
    show(observed[0]!);
    expect(to).toHaveBeenLastCalledWith(
      expect.objectContaining({ tagName: 'path' }),
      expect.objectContaining({ morphSVG: STICKER_PATHS.pot }),
    );
    show(observed[1]!);
    expect(to).toHaveBeenLastCalledWith(
      expect.objectContaining({ tagName: 'path' }),
      expect.objectContaining({ morphSVG: STICKER_PATHS.palette }),
    );
  });
});
