import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorefrontBackdrop } from './StorefrontBackdrop';

/**
 * The backdrop is decoration, so the tests are about the two promises that
 * matter: it is invisible to assistive technology, and it holds still for a
 * guest who asked for less motion.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function backdrop(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('[data-storefront-backdrop]');
  if (!node) throw new Error('no backdrop rendered');
  return node;
}

describe('StorefrontBackdrop', () => {
  it('is hidden from assistive technology and takes no taps', () => {
    const { container } = render(<StorefrontBackdrop />);
    const node = backdrop(container);

    expect(node).toHaveAttribute('aria-hidden', 'true');
    expect(node).toHaveClass('pointer-events-none');
    // No text, no images, nothing a screen reader could wander into.
    expect(node.textContent).toBe('');
    expect(node.querySelector('img')).toBeNull();
  });

  it('paints the four washes, the confetti and the grain', () => {
    const { container } = render(<StorefrontBackdrop />);
    const node = backdrop(container);

    expect(node.querySelectorAll('[data-wash]')).toHaveLength(4);
    expect(node.querySelector('[data-confetti]')).toBeInTheDocument();
    expect(node.querySelector('.grain-overlay')).toBeInTheDocument();
  });

  it('never tracks the scroll when it cannot ask whether motion is welcome', () => {
    // jsdom has no matchMedia, which `useMayAnimate` treats as "do less".
    const { container } = render(<StorefrontBackdrop />);

    fireEvent.scroll(window);

    expect(backdrop(container).style.getPropertyValue('--scroll-y')).toBe('');
  });

  it('tracks the scroll, one frame at a time, when motion is welcome', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    const { container, unmount } = render(<StorefrontBackdrop />);
    const node = backdrop(container);

    // Mount writes the current position straight away.
    await act(async () => {
      await Promise.resolve();
    });
    expect(node.style.getPropertyValue('--scroll-y')).toBe('0px');

    Object.defineProperty(window, 'scrollY', { value: 640, configurable: true });
    await act(async () => {
      fireEvent.scroll(window);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    expect(node.style.getPropertyValue('--scroll-y')).toBe('640px');

    // And lets go of the variable on the way out, so nothing drifts after it.
    unmount();
    expect(node.style.getPropertyValue('--scroll-y')).toBe('');
  });

  it('moves every layer by transform alone, so nothing is laid out again', () => {
    const { container } = render(<StorefrontBackdrop />);
    const node = backdrop(container);

    for (const wash of node.querySelectorAll<HTMLElement>('[data-wash]')) {
      expect(wash.style.transform).toContain('var(--scroll-y, 0px)');
    }
    expect(node.querySelector<HTMLElement>('[data-confetti]')?.style.transform).toContain('mod(');
  });
});
