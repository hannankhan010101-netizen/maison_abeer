import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
