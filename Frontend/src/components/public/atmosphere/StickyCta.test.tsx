import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StickyCta } from './StickyCta';

/**
 * `StickyCta` is now only the name the page still imports: the bar became the
 * floating pill, whose cases live in `nav/FloatingPill.test.tsx`.
 */

const observers: {
  callback: (e: Partial<IntersectionObserverEntry>[]) => void;
  target?: Element;
}[] = [];

class FakeObserver {
  entry: (typeof observers)[number];
  constructor(callback: (e: Partial<IntersectionObserverEntry>[]) => void) {
    this.entry = { callback };
    observers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.target = target;
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  document.body.innerHTML =
    '<main id="main"><header id="hero"></header><div id="booking-widget"></div><div id="mount"></div></main>';
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('StickyCta', () => {
  it('renders the floating pill', () => {
    const { container } = render(<StickyCta />, { container: document.getElementById('mount')! });
    const hero = document.getElementById('hero')!;
    for (const o of observers) {
      if (o.target === hero) act(() => o.callback([{ target: hero, isIntersecting: false }]));
    }
    expect(container.querySelector('[data-floating-pill]')).not.toBeNull();
    expect(container.querySelector('[data-sticky-cta]')).toBeNull();
  });
});
