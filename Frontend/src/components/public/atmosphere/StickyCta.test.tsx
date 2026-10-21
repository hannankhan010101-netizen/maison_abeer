import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StickyCta } from './StickyCta';

/**
 * The bar's whole job is to be there when the guest needs it and gone when it
 * would be in the way, so each condition is driven through a mocked
 * IntersectionObserver that the test fires by hand.
 */

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
const observers: { callback: Callback; targets: Element[] }[] = [];

class FakeObserver {
  targets: Element[] = [];
  constructor(callback: Callback) {
    observers.push({ callback, targets: this.targets });
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {}
}

function setIntersecting(target: Element, isIntersecting: boolean) {
  for (const observer of observers) {
    if (observer.targets.includes(target)) {
      act(() => observer.callback([{ target, isIntersecting }]));
    }
  }
}

let hero: HTMLElement;
let widget: HTMLElement;
const scrollTo = vi.fn();

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  document.body.innerHTML =
    '<main id="main"><header id="hero"></header><div id="booking-widget"></div><div id="mount"></div></main>';
  hero = document.getElementById('hero')!;
  widget = document.getElementById('booking-widget')!;
  widget.scrollIntoView = scrollTo;
});

afterEach(() => {
  vi.unstubAllGlobals();
  scrollTo.mockReset();
  document.body.innerHTML = '';
});

function renderBar() {
  return render(<StickyCta />, { container: document.getElementById('mount')! });
}

describe('StickyCta', () => {
  it('is absent while the hero is on screen', () => {
    renderBar();
    setIntersecting(hero, true);
    expect(screen.queryByRole('link', { name: /Save a seat/ })).toBeNull();
  });

  it('appears once the hero has left the view', () => {
    renderBar();
    setIntersecting(hero, true);
    setIntersecting(hero, false);
    expect(screen.getByRole('link', { name: /Save a seat/ })).toBeInTheDocument();
  });

  it('hides while the booking card is on screen, so it never covers a field', () => {
    renderBar();
    setIntersecting(hero, false);
    setIntersecting(widget, true);
    expect(screen.queryByRole('link', { name: /Save a seat/ })).toBeNull();

    setIntersecting(widget, false);
    expect(screen.getByRole('link', { name: /Save a seat/ })).toBeInTheDocument();
  });

  it('follows the booking card when React replaces it, instead of watching the old one', async () => {
    // The page swaps its loading placeholder for the loaded page (a changed `key`), so the
    // card the observer first found is thrown away and a new one takes its place.
    renderBar();
    setIntersecting(hero, false);
    setIntersecting(widget, true);

    const main = document.getElementById('main')!;
    const replacement = document.createElement('div');
    replacement.id = 'booking-widget';
    main.replaceChild(replacement, widget);
    await act(async () => {});

    // The detached card reports itself gone, as a browser does...
    setIntersecting(widget, false);
    // ...but the card the guest can actually see is the new one.
    setIntersecting(replacement, true);
    expect(screen.queryByRole('link', { name: /Save a seat/ })).toBeNull();

    setIntersecting(replacement, false);
    expect(screen.getByRole('link', { name: /Save a seat/ })).toBeInTheDocument();
  });

  it('is a phone bar: fixed to the bottom, hidden from md up, glass, and at least 44px tall', () => {
    const { container } = renderBar();
    setIntersecting(hero, false);

    const bar = container.querySelector<HTMLElement>('[data-sticky-cta]')!;
    expect(bar).toHaveClass('fixed', 'inset-x-0', 'bottom-0', 'md:hidden');
    expect(bar.className).toContain('var(--glass-bg)');
    expect(bar.className).toContain('var(--glass-border)');
    expect(bar.className).toContain('var(--glass-blur)');
    // Keeps clear of the home indicator on notched phones.
    expect(bar.className).toContain('env(safe-area-inset-bottom)');
    expect(screen.getByRole('link', { name: /Save a seat/ }).className).toContain('min-h-[44px]');
  });

  it('uses only the inks the glass contrast test covers', () => {
    const { container } = renderBar();
    setIntersecting(hero, false);
    const html = container.querySelector('[data-sticky-cta]')!.outerHTML;
    expect(html).toMatch(/text-cocoa/);
    const inks = html.match(/\btext-(cocoa|rose-ink|rose|butter-ink|on-rose|terra|sage)[a-z-]*/g);
    for (const ink of inks ?? []) expect(['text-cocoa', 'text-rose-ink']).toContain(ink);
  });

  it('scrolls to the booking card', () => {
    renderBar();
    setIntersecting(hero, false);
    screen.getByRole('link', { name: /Save a seat/ }).click();
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
