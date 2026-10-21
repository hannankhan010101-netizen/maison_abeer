import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/motion/gsap', () => ({ loadGsap: vi.fn(() => Promise.resolve(null)) }));

import type { PublicClass } from '@/lib/public/api';

import { PhotoFan } from './PhotoFan';

const cake: PublicClass = {
  id: 'class-1',
  name: 'Bento cake decorating',
  starts_at: '2030-01-01T10:00:00Z',
  ends_at: '2030-01-01T12:00:00Z',
  location: null,
  color_token: 'pink',
  photo_url: null,
  seats_left: 4,
  is_full: false,
  waitlist_is_open: false,
};

describe('PhotoFan', () => {
  it('wraps every polaroid in a tossable card that still lets the page scroll', () => {
    const { container } = render(<PhotoFan classes={[cake]} />);

    const tossable = container.querySelectorAll('[data-dragtoss]');
    expect(tossable).toHaveLength(3);
    for (const node of tossable) {
      expect((node as HTMLElement).style.touchAction).toBe('pan-y');
      expect(node.querySelector('figure')).not.toBeNull();
    }
  });
});
