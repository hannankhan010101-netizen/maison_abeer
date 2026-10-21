import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
  it('tells the story of making a pot when the studio teaches pottery', () => {
    page([aClass('terra', 'Pottery & wheel throwing')]);

    expect(screen.getAllByText('A lump of clay').length).toBeGreaterThan(0);
  });

  it('leaves it out for a studio that only teaches cakes and painting', () => {
    page([aClass('pink', 'Bento cakes'), aClass('sage', 'Ceramic painting')]);

    expect(screen.queryByText('A lump of clay')).not.toBeInTheDocument();
    // …while the sections that do follow the classes are still there.
    expect(screen.getByRole('heading', { name: 'Pick your kind of mess' })).toBeInTheDocument();
  });

  it('includes it when pottery is one of several crafts', () => {
    page([aClass('pink', 'Bento cakes'), aClass('terra', 'Pottery')]);

    expect(screen.getAllByText('A lump of clay').length).toBeGreaterThan(0);
  });
});

describe('StorefrontPage rhythm', () => {
  it('spaces its sections with the section-gap token, not per-section margins', () => {
    page([aClass('terra', 'Pottery & wheel throwing')]);

    const wrapper = screen
      .getByRole('heading', { name: 'How it works' })
      .closest('section')!.parentElement!;

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
