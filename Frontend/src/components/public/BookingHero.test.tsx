import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/motion/gsap', () => ({ loadGsap: vi.fn(() => Promise.resolve(null)) }));

import type { PublicClass } from '@/lib/public/api';

import { BookingHero } from './BookingHero';

const upcoming: PublicClass = {
  id: 'class-1',
  name: 'Bento cake decorating',
  starts_at: new Date(Date.now() + 86_400_000).toISOString(),
  ends_at: new Date(Date.now() + 90_000_000).toISOString(),
  location: null,
  color_token: 'pink',
  photo_url: null,
  seats_left: 4,
  is_full: false,
  waitlist_is_open: false,
};

describe('BookingHero', () => {
  it('names the studio in a single h1, split into letters for the entrance', () => {
    const { container } = render(<BookingHero studioName="Maison Abeer" classes={[upcoming]} />);

    const heading = screen.getByRole('heading', { level: 1, name: 'Maison Abeer' });
    expect(heading.querySelectorAll('[data-letter]')).toHaveLength(11);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('keeps the cream headline over a photograph', () => {
    render(
      <BookingHero
        studioName="Maison Abeer"
        heroPhotoUrl="https://example.com/studio.jpg"
        classes={[upcoming]}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-photo-ink');
  });

  it('gives the primary call to action the clay finish, glowing in the rose', () => {
    render(<BookingHero studioName="Maison Abeer" classes={[upcoming]} />);

    const cta = screen.getByRole('link', { name: /explore classes/i });
    expect(cta).toHaveClass('clay');
    expect(cta.style.getPropertyValue('--clay-glow')).toBe('var(--color-rose)');
  });

  it('puts the next-class chip inside a Tilt', () => {
    render(<BookingHero studioName="Maison Abeer" classes={[upcoming]} />);

    const chip = screen.getByText('🎟️').closest('p');
    expect(chip?.closest('[data-tilt]')).not.toBeNull();
  });

  it('shows no chip, and so no tilt, when there is no class to name', () => {
    const { container } = render(<BookingHero studioName="Maison Abeer" classes={[]} />);
    expect(container.querySelector('[data-tilt]')).toBeNull();
  });
});
