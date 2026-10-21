import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PublicClass } from '@/lib/public/api';

import { StudioFooter } from './StudioFooter';

function aClass(id: string, name: string): PublicClass {
  return {
    id,
    name,
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    ends_at: new Date(Date.now() + 90_000_000).toISOString(),
    location: null,
    color_token: 'pink',
    photo_url: null,
    seats_left: 4,
    is_full: false,
    waitlist_is_open: false,
  };
}

/** Three upcoming sessions of two crafts. */
const classes = [
  aClass('a', 'Bento cake decorating'),
  aClass('b', 'Candle pouring'),
  aClass('c', 'Bento cake decorating'),
];

function column(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title });
  return heading.closest('[data-footer-column]') as HTMLElement;
}

describe('StudioFooter', () => {
  it('shows the name as a wordmark', () => {
    const { container } = render(<StudioFooter studioName="Maison Abeer" handle="maisonabeer" />);
    expect(container.querySelector('.font-display')?.textContent).toContain('Maison Abeer');
  });

  it('lays out three columns for classes, a handle and the credit', () => {
    const { container } = render(
      <StudioFooter studioName="Maison Abeer" handle="maisonabeer" classes={classes} />,
    );
    expect(container.querySelector('.sm\\:grid-cols-3')).not.toBeNull();
    expect(container.querySelectorAll('[data-footer-column]')).toHaveLength(3);

    const classLinks = within(column('Classes')).getAllByRole('link');
    expect(classLinks.map((link) => link.textContent)).toEqual([
      'Bento cake decorating',
      'Candle pouring',
    ]);
    for (const link of classLinks) expect(link.getAttribute('href')).toBe('#booking-widget');

    const findUs = within(column('Find us'));
    expect(findUs.getByRole('link', { name: '@maisonabeer' }).getAttribute('href')).toBe(
      'https://instagram.com/maisonabeer',
    );
    expect(findUs.getByRole('link', { name: 'Message us' }).getAttribute('href')).toBe(
      'https://ig.me/m/maisonabeer',
    );
  });

  it('omits the Classes column when there are no classes', () => {
    const { container } = render(
      <StudioFooter studioName="Maison Abeer" handle="maisonabeer" classes={[]} />,
    );
    expect(screen.queryByRole('heading', { name: 'Classes' })).toBeNull();
    expect(container.querySelectorAll('[data-footer-column]')).toHaveLength(1);
  });

  it('omits Find us without a handle', () => {
    render(<StudioFooter studioName="Maison Abeer" handle={null} classes={classes} />);
    expect(screen.queryByRole('heading', { name: 'Find us' })).toBeNull();
  });

  it('credits the photography to Unsplash when there are classes, and so photographs', () => {
    render(<StudioFooter studioName="Maison Abeer" classes={[aClass('terra', 'Pottery')]} />);
    const credit = screen.getByRole('link', { name: /craft photography via Unsplash/ });
    expect(credit.getAttribute('href')).toBe('https://unsplash.com/license');
  });

  it('credits nobody when no class means no stock photograph on the page', () => {
    render(<StudioFooter studioName="Maison Abeer" />);
    expect(screen.queryByText(/Unsplash/)).not.toBeInTheDocument();
  });

  it('ends on a clay Save a seat with a 44px target', () => {
    render(<StudioFooter studioName="Maison Abeer" />);
    const cta = screen.getByRole('link', { name: /Save a seat/ });
    expect(cta.getAttribute('href')).toBe('#booking-widget');
    expect(cta.className).toContain('clay');
    expect(cta.className).toContain('min-h-[44px]');
  });

  it('draws the sign-off as one stroke, hidden from assistive tech, with the words still there', () => {
    const { container } = render(<StudioFooter studioName="Maison Abeer" />);
    const path = container.querySelector('svg path.signoff-stroke');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('pathLength')).toBe('1');
    expect(path?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText(/see you at the studio/)).toBeInTheDocument();
  });

  it('marks the footer visible once it has scrolled into view', () => {
    const { container } = render(<StudioFooter studioName="Maison Abeer" />);
    // jsdom has no IntersectionObserver, so the hook reports visible at once.
    expect(container.querySelector('footer')?.hasAttribute('data-visible')).toBe(true);
  });
});
