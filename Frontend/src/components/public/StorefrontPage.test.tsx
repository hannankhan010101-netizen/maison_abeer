import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PublicClass } from '@/lib/public/api';

import { StorefrontPage } from './StorefrontPage';

/**
 * The page never shows a section about a craft the studio does not teach.
 * `PhotoFan`, `PhotoMarquee`, the chapters and the memory wall all choose from
 * the classes on offer; "the making of" is a story about throwing a pot, so it
 * has to follow the same rule — a studio that only decorates cakes should not be
 * told "from lump to vessel".
 */

function aClass(token: string, name: string): PublicClass {
  return {
    id: `${token}-1`,
    name,
    starts_at: '2026-10-23T09:00:00.000Z',
    ends_at: '2026-10-23T11:30:00.000Z',
    location: null,
    color_token: token,
    photo_url: null,
    seats_left: 4,
    is_full: false,
    waitlist_is_open: false,
  };
}

function page(classes: PublicClass[]) {
  return render(
    <StorefrontPage studioName="Maison Abeer" step={1} showBrandSections classes={classes}>
      <p>booking card</p>
    </StorefrontPage>,
  );
}

describe('StorefrontPage', () => {
  it('tells the story of making a pot when the studio teaches pottery', async () => {
    page([aClass('terra', 'Pottery & wheel throwing')]);

    expect((await screen.findAllByText('A lump of clay')).length).toBeGreaterThan(0);
  });

  it('leaves it out for a studio that only teaches cakes and painting', async () => {
    page([aClass('pink', 'Bento cakes'), aClass('sage', 'Ceramic painting')]);

    // The sections that do follow the classes arrive (they load as islands)…
    expect(
      await screen.findByRole('heading', { name: 'Pick your kind of mess' }),
    ).toBeInTheDocument();
    // …and the pottery story never does.
    expect(screen.queryByText('A lump of clay')).not.toBeInTheDocument();
  });

  it('includes it when pottery is one of several crafts', async () => {
    page([aClass('pink', 'Bento cakes'), aClass('terra', 'Pottery')]);

    expect((await screen.findAllByText('A lump of clay')).length).toBeGreaterThan(0);
  });
});

describe('StorefrontPage rhythm', () => {
  it('spaces its sections with the section-gap token, not per-section margins', async () => {
    page([aClass('terra', 'Pottery & wheel throwing')]);

    // Each section loads inside a lazy island, so the stack is the island's parent.
    const wrapper = (await screen.findByRole('heading', { name: 'How it works' })).closest(
      '[data-lazy-section]',
    )!.parentElement!;

    // One rhythm token — and as block margins, not a flex gap. GSAP's
    // ScrollTrigger turns pin spacing off inside a flex parent, so a flex
    // column let the booking card scroll straight over the pinned clay scene.
    expect(wrapper.className).toContain('space-y-[var(--section-gap)]');
    expect(wrapper.className).not.toMatch(/space-y-\d/);
    expect(wrapper.className).not.toMatch(/\bflex\b|gap-\[/);
  });
});

vi.mock('@/lib/public/useStorefrontPosition', () => ({
  useStorefrontPosition: () => ({ heroVisible: false, widgetVisible: false }),
}));

describe('StorefrontPage wiring (v3)', () => {
  it('gives the floating pill the studio name and the classes', () => {
    page([aClass('terra', 'Pottery & wheel throwing')]);

    const pill = screen.getByRole('navigation', { name: 'Book a seat' });
    expect(pill).toHaveTextContent('Maison Abeer');
    expect(pill).toHaveTextContent(/seats? left|fully booked/);
  });

  it('no longer tells the seat count a third time on a postcard', () => {
    page([aClass('terra', 'Pottery & wheel throwing')]);

    expect(screen.queryByText(/seats open across/)).not.toBeInTheDocument();
  });

  it('puts the one honest number on the ticket stub', async () => {
    page([aClass('terra', 'Pottery & wheel throwing')]);

    expect(await screen.findByText(/^4 seats left /)).toBeInTheDocument();
  });

  it('lists the classes in the footer, each a way back to the card', () => {
    page([aClass('terra', 'Pottery & wheel throwing'), aClass('pink', 'Bento cakes')]);

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Pottery & wheel throwing' })).toHaveAttribute(
      'href',
      '#booking-widget',
    );
    expect(within(footer).getByRole('link', { name: 'Bento cakes' })).toBeInTheDocument();
  });
});

describe('StorefrontPage islands', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the sections below the fold out of the page until they are near the viewport', () => {
    class NeverIntersects {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', NeverIntersects);

    const { container } = page([aClass('terra', 'Pottery & wheel throwing')]);

    // The hero, the pill, the ticket and the footer are there at once…
    expect(screen.getByRole('navigation', { name: 'Book a seat' })).toBeInTheDocument();
    expect(screen.getByText('booking card')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    // …the sections are placeholders that hold their height and say what they will be.
    for (const label of ['How it works', 'Craft chapters', 'Memory wall', 'Making of']) {
      expect(container.querySelector(`[data-lazy-section="${label}"]`), label).toBeTruthy();
    }
    expect(screen.queryByRole('heading', { name: 'How it works' })).not.toBeInTheDocument();
    expect(screen.queryByText('A lump of clay')).not.toBeInTheDocument();
  });
});

describe('StorefrontPage order (v4)', () => {
  it('puts the booking card right after the hero, with the sections below it', async () => {
    page([aClass('terra', 'Pottery & wheel throwing')]);

    const card = screen.getByText('booking card');
    const hero = screen.getByRole('heading', { level: 1, name: 'Maison Abeer' });
    const receipt = await screen.findByRole('heading', { name: 'How it works' });

    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(follows(hero, card)).toBe(true);
    expect(follows(card, receipt)).toBe(true);
  });

  it('adds the craft corner as an island below the card, only for the crafts taught', async () => {
    const { container } = page([aClass('terra', 'Pottery & wheel throwing')]);

    expect(container.querySelector('[data-lazy-section="Craft corner"]')).toBeTruthy();
    expect(
      await screen.findByRole('heading', { name: /A little lesson before you come/ }),
    ).toBeInTheDocument();
    // One craft, so no tab row; and nothing about a craft the studio does not teach.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText('Bento cakes')).not.toBeInTheDocument();
  });

  it('offers a tab per craft when the studio teaches several', async () => {
    page([aClass('pink', 'Bento cakes'), aClass('terra', 'Pottery')]);

    expect(await screen.findByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('has no craft corner when there are no classes', () => {
    const { container } = page([]);

    expect(container.querySelector('[data-lazy-section="Craft corner"]')).toBeNull();
  });
});
