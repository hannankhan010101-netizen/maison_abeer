import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { type PublicClass } from '@/lib/public/api';

import { PopupCard } from './PopupCard';

const SOON = new Date(Date.now() + 3 * 86_400_000).toISOString();

function item(over: Partial<PublicClass> = {}): PublicClass {
  return {
    id: 'a',
    name: 'Bento cake',
    starts_at: SOON,
    ends_at: SOON,
    location: 'Café Lumière, Clifton',
    color_token: 'pink',
    photo_url: null,
    seats_left: 4,
    is_full: false,
    waitlist_is_open: false,
    ...over,
  };
}

function card(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-popup-card]') as HTMLElement;
}

describe('PopupCard', () => {
  it('has one primary button and one sibling Maps link when there is a location', () => {
    const { container } = render(<PopupCard item={item()} now={new Date()} onPick={() => {}} />);
    const root = card(container);

    expect(within(root).getAllByRole('button')).toHaveLength(1);
    const links = within(root).getAllByRole('link');
    expect(links).toHaveLength(1);

    const maps = links[0]!;
    expect(maps).toHaveAccessibleName(/Maps/);
    expect(maps).toHaveAttribute(
      'href',
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Café Lumière, Clifton')}`,
    );
    expect(maps).toHaveAttribute('target', '_blank');
    expect(maps).toHaveAttribute('rel', expect.stringContaining('noopener'));
    // Never a link inside the button.
    expect(maps.closest('button')).toBeNull();
    expect(within(root).getByRole('button').querySelector('a')).toBeNull();
  });

  it('leads with the location line and its pin', () => {
    const { container } = render(<PopupCard item={item()} now={new Date()} onPick={() => {}} />);
    const line = container.querySelector('[data-location-line]');
    expect(line).toHaveTextContent('Café Lumière, Clifton');
    expect(line?.querySelector('[data-pin]')).not.toBeNull();
  });

  it('shows no pin line, no link and no "null" without a location', () => {
    for (const location of [null, '   ']) {
      const { container, unmount } = render(
        <PopupCard item={item({ location })} now={new Date()} onPick={() => {}} />,
      );
      const root = card(container);
      expect(root.querySelector('[data-location-line]')).toBeNull();
      expect(root.querySelector('[data-pin]')).toBeNull();
      expect(within(root).queryByRole('link')).toBeNull();
      expect(root.textContent).not.toMatch(/undefined|null/);
      unmount();
    }
  });

  it('keeps the seats line height reserved and says waitlist when full', () => {
    const { container } = render(
      <PopupCard
        item={item({ is_full: true, seats_left: 0, waitlist_is_open: true })}
        now={new Date()}
        onPick={() => {}}
      />,
    );
    const line = container.querySelector('[data-seats-line]');
    expect(line).toHaveClass('block', 'min-h-7');
    expect(line).toHaveTextContent(/waitlist/i);
  });

  it('shows the craft chip and the class photo', () => {
    const { container } = render(
      <PopupCard item={item({ color_token: 'terra' })} now={new Date()} onPick={() => {}} />,
    );
    expect(container.querySelector('[data-craft-chip]')).toHaveTextContent(/pottery/i);
    expect(
      (container.querySelector('[data-popup-photo]') as HTMLElement).style.backgroundImage,
    ).toContain('/studio/pottery-');
  });

  it('uses the class type photo when it has one', () => {
    const { container } = render(
      <PopupCard
        item={item({ photo_url: 'https://cdn.example/bento.jpg' })}
        now={new Date()}
        onPick={() => {}}
      />,
    );
    expect(
      (container.querySelector('[data-popup-photo]') as HTMLElement).style.backgroundImage,
    ).toContain('https://cdn.example/bento.jpg');
  });

  it('calls onPick with the class, and names the leaf of the class returned from', async () => {
    const onPick = vi.fn();
    const { container } = render(
      <PopupCard item={item()} now={new Date()} onPick={onPick} returnedFromId="a" />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Bento cake/ }));
    expect(onPick).toHaveBeenCalledWith(item());
    const named = Array.from(container.querySelectorAll<HTMLElement>('*')).filter(
      (el) => el.style.viewTransitionName === 'class-leaf',
    );
    expect(named).toHaveLength(1);
  });
});
