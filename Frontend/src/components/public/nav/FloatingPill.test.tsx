import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicClass } from '@/lib/public/api';

import { FloatingPill } from './FloatingPill';

/**
 * The pill's whole job is to be there when the guest needs it and gone when it
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
    '<main id="main"><header id="hero"></header><div id="booking-widget"></div><div id="mount"></div><footer id="footer"></footer></main>';
  hero = document.getElementById('hero')!;
  widget = document.getElementById('booking-widget')!;
  widget.scrollIntoView = scrollTo;
});

afterEach(() => {
  vi.unstubAllGlobals();
  scrollTo.mockReset();
  document.body.innerHTML = '';
});

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function aClass(overrides: Partial<PublicClass> = {}): PublicClass {
  return {
    id: 'c1',
    name: 'Wheel throwing',
    starts_at: inDays(3),
    ends_at: inDays(3.1),
    location: null,
    color_token: 'rose',
    photo_url: null,
    seats_left: 8,
    is_full: false,
    waitlist_is_open: false,
    ...overrides,
  };
}

function renderPill(props: Parameters<typeof FloatingPill>[0] = {}) {
  return render(<FloatingPill {...props} />, { container: document.getElementById('mount')! });
}

const pill = () => document.querySelector<HTMLElement>('[data-floating-pill]');
const link = () => screen.queryByRole('link', { name: /Save a seat/ });

describe('FloatingPill', () => {
  it('is absent while the hero is on screen', () => {
    renderPill({ studioName: 'Maison Abeer', classes: [aClass()] });
    setIntersecting(hero, true);
    expect(pill()).toBeNull();
    expect(link()).toBeNull();
  });

  it('hides while the booking card is on screen, so it never covers a field', () => {
    renderPill({ studioName: 'Maison Abeer', classes: [aClass()] });
    setIntersecting(hero, false);
    setIntersecting(widget, true);
    expect(pill()).toBeNull();

    setIntersecting(widget, false);
    expect(pill()).not.toBeNull();
  });

  it('follows the booking card when React replaces it, instead of watching the old one', async () => {
    renderPill();
    setIntersecting(hero, false);
    setIntersecting(widget, true);

    const main = document.getElementById('main')!;
    const replacement = document.createElement('div');
    replacement.id = 'booking-widget';
    main.replaceChild(replacement, widget);
    await act(async () => {});

    setIntersecting(widget, false);
    setIntersecting(replacement, true);
    expect(link()).toBeNull();

    setIntersecting(replacement, false);
    expect(link()).toBeInTheDocument();
  });

  it('otherwise shows the name, the next class in brief and a 44px link', () => {
    renderPill({ studioName: 'Maison Abeer', classes: [aClass()] });
    setIntersecting(hero, false);

    const nav = screen.getByRole('navigation', { name: 'Book a seat' });
    expect(nav).toHaveAttribute('data-floating-pill');
    expect(nav).toHaveClass('floating-pill');
    expect(nav.querySelector('.floating-pill__name')).toHaveTextContent('Maison Abeer');
    const brief = nav.querySelector('.floating-pill__next')!;
    expect(brief).toHaveClass('hidden', 'sm:inline');
    expect(brief.textContent).toMatch(/ · 8 seats left$/);
    expect(link()!.className).toContain('min-h-[44px]');
    expect(link()).toHaveClass('clay');
    expect(link()).toHaveAttribute('href', '#booking-widget');
  });

  it('says "last seat" and "fully booked, waitlist open" as the hero chip does', () => {
    const { rerender } = renderPill({ classes: [aClass({ seats_left: 1 })] });
    setIntersecting(hero, false);
    expect(pill()!.querySelector('.floating-pill__next')!.textContent).toMatch(/ · last seat$/);

    rerender(
      <FloatingPill classes={[aClass({ seats_left: 0, is_full: true, waitlist_is_open: true })]} />,
    );
    expect(pill()!.querySelector('.floating-pill__next')!.textContent).toMatch(
      / · fully booked, waitlist open$/,
    );
  });

  it('has no name span without a name, and no brief without a class', () => {
    renderPill({ classes: [] });
    setIntersecting(hero, false);
    expect(pill()!.querySelector('.floating-pill__name')).toBeNull();
    expect(pill()!.querySelector('.floating-pill__next')).toBeNull();
    expect(link()).toBeInTheDocument();
  });

  it('keeps a long name to one truncated line', () => {
    renderPill({ studioName: 'The Very Long Studio Name Of Cla' });
    setIntersecting(hero, false);
    const name = pill()!.querySelector('.floating-pill__name')!;
    expect(name.textContent).toHaveLength(32);
    expect(name).toHaveClass('truncate', 'max-w-[14ch]');
  });

  it('sits at the bottom on phones and top-centre from md, on glass', () => {
    renderPill();
    setIntersecting(hero, false);
    const nav = pill()!;
    expect(nav).toHaveClass('fixed', 'inset-x-0', 'bottom-0');
    expect(nav).toHaveClass('md:top-4', 'md:left-1/2', 'md:-translate-x-1/2', 'md:bottom-auto');
    expect(nav.className).toContain('env(safe-area-inset-bottom)');
    expect(nav.className).toContain('bg-[var(--glass-bg)]');
    expect(nav.className).toContain('backdrop-blur-[var(--glass-blur)]');
    expect(nav.className).toContain('shadow-[inset_0_0_0_1px_var(--glass-border)]');
  });

  it('uses only the inks the glass contrast test covers outside the clay button', () => {
    renderPill({ studioName: 'Maison Abeer', classes: [aClass()] });
    setIntersecting(hero, false);
    const nav = pill()!.cloneNode(true) as HTMLElement;
    nav.querySelector('a')!.remove();
    const inks = nav.outerHTML.match(
      /\btext-(cocoa|rose-ink|rose|butter-ink|on-rose|terra|sage|latte)[a-z-]*/g,
    );
    for (const ink of inks ?? []) expect(['text-cocoa', 'text-latte']).toContain(ink);
  });

  it('scrolls to the booking card', () => {
    renderPill();
    setIntersecting(hero, false);
    link()!.click();
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});

describe('FloatingPill at the end of the page', () => {
  it('gives way to the footer, which carries its own Save a seat', () => {
    render(<FloatingPill studioName="Maison Abeer" classes={[aClass()]} />);
    setIntersecting(hero, false);
    expect(screen.getByRole('navigation', { name: 'Book a seat' })).toBeInTheDocument();

    setIntersecting(document.getElementById('footer')!, true);
    expect(screen.queryByRole('navigation', { name: 'Book a seat' })).not.toBeInTheDocument();

    setIntersecting(document.getElementById('footer')!, false);
    expect(screen.getByRole('navigation', { name: 'Book a seat' })).toBeInTheDocument();
  });
});
