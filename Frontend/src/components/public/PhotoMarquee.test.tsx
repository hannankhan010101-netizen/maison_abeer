import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PublicClass } from '@/lib/public/api';
import { allocatePhotos } from '@/lib/public/photoBudget';

import { PhotoMarquee } from './PhotoMarquee';

function aClass(token: string): PublicClass {
  return {
    id: `${token}-1`,
    name: 'A class',
    starts_at: '2030-01-01T10:00:00Z',
    ends_at: '2030-01-01T12:00:00Z',
    location: null,
    color_token: token,
    photo_url: null,
    seats_left: 4,
    is_full: false,
    waitlist_is_open: false,
  };
}

const THREE = [aClass('terra'), aClass('pink'), aClass('sage')];

describe('PhotoMarquee', () => {
  it.each([['terra'], ['pink'], ['sage']])(
    'draws nothing for one craft (%s): the budget has no photos left for it',
    (token) => {
      const { container } = render(<PhotoMarquee classes={[aClass(token)]} />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('draws nothing for two crafts either', () => {
    const { container } = render(<PhotoMarquee classes={[aClass('pink'), aClass('terra')]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('calls three crafts’ stock photos what they are', () => {
    const { container } = render(<PhotoMarquee classes={THREE} />);

    expect(screen.getByRole('region', { name: 'The crafts, up close' })).toBeInTheDocument();
    expect(screen.getByText('the crafts, up close')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/moments from the studio/i);
    expect(container.innerHTML).not.toMatch(/moments from the studio/i);
  });

  it('shows the photos the budget leaves it, each announced once', () => {
    render(<PhotoMarquee classes={THREE} />);

    const region = screen.getByRole('region', { name: 'The crafts, up close' });
    const announced = [...region.querySelectorAll('img')].filter(
      (img) => !img.closest('[aria-hidden="true"]') && img.getAttribute('alt'),
    );
    const expected = allocatePhotos(['pottery', 'cake', 'painting']).marquee;
    expect(announced.map((img) => img.getAttribute('src'))).toEqual(
      expected.map((photo) => photo.small),
    );
  });
});
