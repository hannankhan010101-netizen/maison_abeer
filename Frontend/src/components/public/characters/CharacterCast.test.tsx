import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { tier, haptic, onScreen } = vi.hoisted(() => ({
  tier: vi.fn(() => 1 as 0 | 1 | 2),
  haptic: vi.fn(),
  onScreen: vi.fn(() => true),
}));

vi.mock('@/lib/motion', () => ({ useMotionTier: tier, haptic }));
vi.mock('./useCastOnScreen', () => ({
  useCastOnScreen: () => [{ current: null }, onScreen()],
}));

import type { CraftKind } from '@/lib/public/studioPhotos';

import { BLINK_EVERY_MS, CharacterCast } from './CharacterCast';

const FACTS: Record<CraftKind, string[]> = {
  pottery: ['clay one', 'clay two'],
  cake: ['cake one', 'cake two', 'cake three'],
  painting: ['paint one'],
};

function liveRegion(name: RegExp) {
  const button = screen.getByRole('button', { name });
  return button.parentElement!.querySelector('[aria-live="polite"]')!;
}

beforeEach(() => {
  tier.mockReset();
  tier.mockReturnValue(1);
  haptic.mockReset();
  onScreen.mockReset();
  onScreen.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CharacterCast', () => {
  it('renders only the crafts the studio teaches, each a named button', () => {
    render(<CharacterCast crafts={['cake', 'painting']} facts={FACTS} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Bento, tap for a cake fact',
      'Dot, tap for a painting fact',
    ]);
    expect(screen.queryByRole('button', { name: /Pip/ })).toBeNull();
  });

  it('a tap before the facts arrive gets its fact when they do', () => {
    const empty = { pottery: [], cake: [], painting: [] };
    const { rerender } = render(<CharacterCast crafts={['cake']} facts={empty} />);
    fireEvent.click(screen.getByRole('button', { name: /Bento/ }));
    expect(liveRegion(/Bento/).textContent).toBe('');
    rerender(<CharacterCast crafts={['cake']} facts={FACTS} />);
    expect(liveRegion(/Bento/).textContent).toBe('cake one');
  });

  it('renders nothing for a studio with no classes', () => {
    const { container } = render(<CharacterCast crafts={[]} facts={FACTS} />);
    expect(container.innerHTML).toBe('');
  });

  it('pops the next fact on each tap, cycling, and says wow', async () => {
    const user = userEvent.setup();
    render(<CharacterCast crafts={['pottery']} facts={FACTS} />);
    const button = screen.getByRole('button', { name: 'Pip, tap for a clay fact' });
    const live = liveRegion(/Pip/);
    expect(live.textContent).toBe('');

    await user.click(button);
    expect(live.textContent).toBe('clay one');
    expect(button.querySelector('svg')!.getAttribute('data-mood')).toBe('wow');
    expect(haptic).toHaveBeenCalledWith('tap');

    await user.click(button);
    expect(live.textContent).toBe('clay two');
    await user.click(button);
    expect(live.textContent).toBe('clay one');
  });

  it('answers Enter and Space from the keyboard', async () => {
    const user = userEvent.setup();
    render(<CharacterCast crafts={['cake']} facts={FACTS} />);
    const live = liveRegion(/Bento/);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Bento/ }));
    await user.keyboard('{Enter}');
    expect(live.textContent).toBe('cake one');
    await user.keyboard(' ');
    expect(live.textContent).toBe('cake two');
  });

  it('at tier 0 carries no animation classes, even after a tap', () => {
    tier.mockReturnValue(0);
    const { container } = render(
      <CharacterCast crafts={['pottery', 'cake', 'painting']} facts={FACTS} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Pip/ }));
    expect(liveRegion(/Pip/).textContent).toBe('clay one');
    expect(
      container.querySelector('.character-float, .character-squish, .character-pop'),
    ).toBeNull();
  });

  it('floats at tier 1, but never blinks', () => {
    vi.useFakeTimers();
    render(<CharacterCast crafts={['pottery']} facts={FACTS} />);
    const button = screen.getByRole('button', { name: /Pip/ });
    expect(button.querySelector('.character-float')).not.toBeNull();
    expect(button.className).not.toContain('character-float');
    act(() => {
      vi.advanceTimersByTime(BLINK_EVERY_MS * 3);
    });
    expect(button.querySelector('svg')!.getAttribute('data-mood')).toBe('happy');
  });

  it('squishes on a tap above tier 0', () => {
    render(<CharacterCast crafts={['pottery']} facts={FACTS} />);
    const button = screen.getByRole('button', { name: /Pip/ });
    fireEvent.click(button);
    expect(button.querySelector('.character-squish')).not.toBeNull();
  });

  it('blinks now and then at tier 2', () => {
    vi.useFakeTimers();
    tier.mockReturnValue(2);
    render(<CharacterCast crafts={['pottery']} facts={FACTS} />);
    const svg = () => screen.getByRole('button', { name: /Pip/ }).querySelector('svg')!;
    expect(svg().getAttribute('data-mood')).toBe('happy');
    act(() => {
      vi.advanceTimersByTime(BLINK_EVERY_MS);
    });
    expect(svg().getAttribute('data-mood')).toBe('sleepy');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(svg().getAttribute('data-mood')).toBe('happy');
  });

  it('pauses off screen: no blink, and the float is marked paused', () => {
    vi.useFakeTimers();
    tier.mockReturnValue(2);
    onScreen.mockReturnValue(false);
    const { container } = render(<CharacterCast crafts={['pottery']} facts={FACTS} />);
    expect(container.querySelector('.character-cast')!.hasAttribute('data-paused')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(BLINK_EVERY_MS * 3);
    });
    const svg = screen.getByRole('button', { name: /Pip/ }).querySelector('svg')!;
    expect(svg.getAttribute('data-mood')).toBe('happy');
  });

  it('pauses while the tab is hidden', () => {
    tier.mockReturnValue(2);
    const { container } = render(<CharacterCast crafts={['pottery']} facts={FACTS} />);
    const root = container.querySelector('.character-cast')!;
    expect(root.hasAttribute('data-paused')).toBe(false);
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(root.hasAttribute('data-paused')).toBe(true);
    hidden.mockRestore();
  });
});
