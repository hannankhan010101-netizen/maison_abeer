import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mayAnimate } = vi.hoisted(() => ({ mayAnimate: vi.fn(() => false) }));

vi.mock('@/lib/motion/gsap', () => ({ loadGsap: vi.fn(() => Promise.resolve(null)) }));
vi.mock('@/lib/public/useMayAnimate', () => ({ useMayAnimate: mayAnimate }));

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

beforeEach(() => {
  mayAnimate.mockReset();
  mayAnimate.mockReturnValue(false);
});

/** What a screen reader gets: the header's text with every aria-hidden subtree removed. */
function accessibleText(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return (copy.textContent ?? '').replace(/\s+/g, ' ');
}

function visibleVerbs(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.hero-promise [data-verb]')].map(
    (node) => node.textContent ?? '',
  );
}

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

  describe('the promise line', () => {
    const PROMISE = 'come make something with your own hands';

    it('reads as one sentence to a screen reader', () => {
      mayAnimate.mockReturnValue(true);
      const { container } = render(<BookingHero studioName="Maison Abeer" classes={[upcoming]} />);

      const text = accessibleText(container.querySelector('header')!);
      expect(text.split(PROMISE)).toHaveLength(2);
    });

    it('is display type, with the verb in the rose ink', () => {
      const { container } = render(<BookingHero studioName="Maison Abeer" classes={[upcoming]} />);

      const promise = container.querySelector('p.hero-promise')!;
      expect(promise).toHaveClass(
        'font-display',
        'text-[clamp(22px,3.2vw,40px)]',
        'leading-[1.1]',
        'max-w-[22ch]',
        'text-balance',
      );
      expect(promise.querySelector('.verb-roll')).toHaveClass('text-rose-ink');
    });

    it('rolls the verbs of the crafts the classes teach', () => {
      mayAnimate.mockReturnValue(true);
      const terra = { ...upcoming, id: 'class-2', color_token: 'terra' };
      const { container } = render(<BookingHero studioName="Maison Abeer" classes={[terra]} />);

      expect(visibleVerbs(container)).toEqual(['throw', 'centre', 'trim']);
    });

    it('says "make" for a studio with no classes', () => {
      mayAnimate.mockReturnValue(true);
      const { container } = render(<BookingHero studioName="Maison Abeer" classes={[]} />);

      expect(visibleVerbs(container)).toEqual(['make']);
    });

    it('says a still "make" when it may not animate', () => {
      const terra = { ...upcoming, id: 'class-2', color_token: 'terra' };
      const { container } = render(<BookingHero studioName="Maison Abeer" classes={[terra]} />);

      expect(visibleVerbs(container)).toEqual(['make']);
    });

    it('no longer carries the old sentence', () => {
      const { container } = render(<BookingHero studioName="Maison Abeer" classes={[upcoming]} />);

      expect(container.textContent).not.toMatch(/pick a class below/i);
    });
  });
});

describe('BookingHero Instagram line', () => {
  it('builds the link and the @ text from the parsed handle', () => {
    render(
      <BookingHero
        studioName="Maison Abeer"
        classes={[upcoming]}
        handle=" https://www.instagram.com/Maison._Abeer/?igsh=1 "
      />,
    );
    const link = screen.getByRole('link', { name: /find us on instagram/i });
    expect(link.getAttribute('href')).toBe('https://instagram.com/maison._abeer');
    expect(link.textContent).toContain('@maison._abeer');
    expect(link.textContent).not.toContain('@@');
  });

  it.each([null, undefined, '', '  ', 'a..b', 'javascript:alert(1)', '@@x'])(
    'renders no Instagram link and no stray @ for %j',
    (handle) => {
      const { container } = render(
        <BookingHero studioName="Maison Abeer" classes={[upcoming]} handle={handle} />,
      );
      expect(container.querySelector('a[href*="instagram.com"]')).toBeNull();
      expect(container.querySelector('a[href*="ig.me"]')).toBeNull();
      expect(container.textContent).not.toMatch(/find us on instagram/i);
      expect(container.textContent).not.toContain('@');
    },
  );
});
