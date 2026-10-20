import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicClass, PublicMemory } from '@/lib/public/api';

const motion = vi.hoisted(() => ({
  mayAnimate: false,
  loadGsap: vi.fn(),
  transition: vi.fn(),
}));

vi.mock('@/lib/motion', () => ({
  useMayAnimate: () => motion.mayAnimate,
  loadGsap: motion.loadGsap,
  withViewTransition: async (update: () => void) => {
    motion.transition();
    update();
  },
}));

import { MemoryWall } from './MemoryWall';
import { WordWall } from './WordWall';

function cls(token: string, id = token): PublicClass {
  return {
    id,
    name: `class ${id}`,
    photo_url: null,
    starts_at: '2030-01-01T10:00:00Z',
    ends_at: '2030-01-01T12:00:00Z',
    location: null,
    color_token: token,
    seats_left: 3,
    is_full: false,
    waitlist_is_open: false,
  };
}

const pottery = [cls('terra')];
const twoCrafts = [cls('terra'), cls('pink')];

function studio(n: number, caption = (i: number) => `memory ${i}`): PublicMemory[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    photo_url: `https://example.com/${i}.jpg`,
    caption: caption(i),
    craft: null,
  }));
}

function viewTransitionNames(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('*'))
    .map((el) => el.style.viewTransitionName)
    .filter((name) => name && name !== 'none');
}

beforeEach(() => {
  motion.mayAnimate = false;
  motion.loadGsap.mockReset();
  motion.transition.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MemoryWall', () => {
  it('renders nothing when there is nothing to show', () => {
    const { container } = render(<MemoryWall classes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('frames the craft photography as what you will make, never as memories', () => {
    render(<MemoryWall classes={pottery} />);

    expect(screen.getByRole('heading', { name: "What you'll make here" })).toBeInTheDocument();
    expect(screen.queryByText(/memories/i)).not.toBeInTheDocument();
  });

  it('says memories only when the studio sent some, and shows only those', () => {
    render(<MemoryWall classes={pottery} memories={studio(2)} />);

    expect(screen.getByRole('heading', { name: 'Memories from the studio' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^memory \d$/ })).toHaveLength(2);
    expect(document.querySelectorAll('img[src*="/studio/"]')).toHaveLength(0);
  });

  describe('tiles', () => {
    it('is a button named by its caption', () => {
      render(<MemoryWall classes={[]} memories={studio(1, () => 'our first mug')} />);
      expect(screen.getByRole('button', { name: 'our first mug' })).toBeInTheDocument();
    });

    it('spans two rows for a portrait photo and one for a landscape', () => {
      render(<MemoryWall classes={pottery} />);
      const spans = Array.from(document.querySelectorAll('[data-span]')).map((el) =>
        el.getAttribute('data-span'),
      );
      expect(spans).toContain('2');
      expect(spans).toContain('1');
    });

    it('keeps a heart across renders, with no count anywhere', () => {
      const { unmount } = render(<MemoryWall classes={[]} memories={studio(2)} />);
      const heart = screen.getAllByRole('button', { name: /^Keep/ })[0]!;

      expect(heart).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(heart);
      expect(heart).toHaveAttribute('aria-pressed', 'true');
      expect(heart.textContent).not.toMatch(/\d/);

      unmount();
      render(<MemoryWall classes={[]} memories={studio(2)} />);
      expect(screen.getAllByRole('button', { name: /^Keep/ })[0]).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getAllByRole('button', { name: /^Keep/ })[1]).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('still hearts when storage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      render(<MemoryWall classes={[]} memories={studio(1)} />);
      const heart = screen.getByRole('button', { name: /^Keep/ });
      fireEvent.click(heart);
      expect(heart).toHaveAttribute('aria-pressed', 'true');
    });

    it('survives a very long caption', () => {
      const long = 'w'.repeat(400);
      render(<MemoryWall classes={[]} memories={studio(1, () => long)} />);
      expect(screen.getByRole('button', { name: long })).toBeInTheDocument();
    });
  });

  describe('filter chips', () => {
    it('has none for a single craft', () => {
      render(<MemoryWall classes={pottery} />);
      expect(screen.queryByRole('button', { name: 'Pottery' })).not.toBeInTheDocument();
    });

    it('has some for two crafts, and filtering hides the others instantly under reduced motion', () => {
      render(<MemoryWall classes={twoCrafts} />);

      const chip = screen.getByRole('button', { name: 'Pottery' });
      expect(chip).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(chip);

      expect(chip).toHaveAttribute('aria-pressed', 'true');
      const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-craft]'));
      expect(tiles.some((t) => t.hidden)).toBe(true);
      expect(tiles.filter((t) => !t.hidden).every((t) => t.dataset.craft === 'pottery')).toBe(true);
      expect(motion.loadGsap).not.toHaveBeenCalled();
    });

    it('never loads GSAP under reduced motion', () => {
      render(<MemoryWall classes={twoCrafts} />);
      fireEvent.click(screen.getByRole('button', { name: 'Cake' }));
      expect(motion.loadGsap).not.toHaveBeenCalled();
    });

    it('animates with Flip when motion is allowed', async () => {
      motion.mayAnimate = true;
      const from = vi.fn();
      motion.loadGsap.mockResolvedValue({
        Flip: { getState: vi.fn(() => ({})), from },
      });
      render(<MemoryWall classes={twoCrafts} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Pottery' }));
      });

      expect(motion.loadGsap).toHaveBeenCalledWith('Flip');
      expect(from).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Pottery' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('leaves the static wall, filtering instantly, when GSAP fails to load', async () => {
      motion.mayAnimate = true;
      motion.loadGsap.mockResolvedValue(null);
      render(<MemoryWall classes={twoCrafts} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Pottery' }));
      });

      const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-craft]'));
      expect(tiles.filter((t) => !t.hidden).every((t) => t.dataset.craft === 'pottery')).toBe(true);
      expect(tiles.length).toBeGreaterThan(0);
    });
  });

  describe('lightbox', () => {
    it('opens on the tile, closes on Escape, and returns focus to the tile', async () => {
      render(<MemoryWall classes={[]} memories={studio(3)} />);
      const tile = screen.getByRole('button', { name: 'memory 1' });
      tile.focus();

      fireEvent.click(tile);
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('memory 1')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      await act(async () => {});
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(tile).toHaveFocus();
    });

    it('opens once however many times the tile is activated', () => {
      render(<MemoryWall classes={[]} memories={studio(3)} />);
      const tile = screen.getByRole('button', { name: 'memory 0' });

      fireEvent.click(tile);
      fireEvent.click(tile);

      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(motion.transition).toHaveBeenCalledTimes(1);
    });

    it('has exactly one element with a view-transition-name while open, and none after', async () => {
      render(<MemoryWall classes={[]} memories={studio(3)} />);
      fireEvent.click(screen.getByRole('button', { name: 'memory 0' }));
      expect(viewTransitionNames()).toEqual(['memory']);

      fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(viewTransitionNames()).toEqual(['memory']);

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(viewTransitionNames().length).toBeLessThanOrEqual(1);
      await act(async () => {});
      expect(viewTransitionNames()).toEqual([]);
    });

    it('moves between photos with the arrow keys and the buttons', () => {
      render(<MemoryWall classes={[]} memories={studio(3)} />);
      fireEvent.click(screen.getByRole('button', { name: 'memory 0' }));
      const dialog = screen.getByRole('dialog');

      fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(within(dialog).getByText('memory 1')).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      expect(within(dialog).getByText('memory 0')).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Previous photo' }));
      expect(within(dialog).getByText('memory 2')).toBeInTheDocument();
    });

    it('offers no navigation for a single photo', () => {
      render(<MemoryWall classes={[]} memories={studio(1)} />);
      fireEvent.click(screen.getByRole('button', { name: 'memory 0' }));
      const dialog = screen.getByRole('dialog');

      expect(within(dialog).queryByRole('button', { name: 'Next photo' })).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Previous photo' }),
      ).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });
  });
});

describe('WordWall', () => {
  it('renders nothing without approved words', () => {
    expect(render(<WordWall words={[]} />).container).toBeEmptyDOMElement();
    expect(render(<WordWall words={undefined} />).container).toBeEmptyDOMElement();
  });

  it('shows words as text only, truncated to 24 characters', () => {
    const { container } = render(
      <WordWall
        words={[
          { id: 'a', word: 'joyful' },
          { id: 'b', word: 'x'.repeat(60) },
        ]}
      />,
    );

    expect(screen.getByText('joyful')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[1]!.textContent!.length).toBe(24);
    expect(container.querySelector('img, a, button, svg')).toBeNull();
  });

  it('shows through the wall only when words exist', () => {
    render(<MemoryWall classes={pottery} words={[{ id: 'a', word: 'joyful' }]} />);
    expect(screen.getByText('joyful')).toBeInTheDocument();
  });
});
