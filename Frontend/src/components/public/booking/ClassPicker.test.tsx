import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type PublicClass } from '@/lib/public/api';
import { formatDay } from '@/lib/public/bookingCopy';
import { whenLine } from '@/lib/public/format';

const withViewTransition = vi.hoisted(() => vi.fn());
vi.mock('@/lib/motion', () => ({ withViewTransition, useMotionTier: () => 1 }));

import { ClassPicker } from './ClassPicker';

const SOON = new Date(Date.now() + 3 * 86_400_000).toISOString();

function item(id: string, name: string): PublicClass {
  return {
    id,
    name,
    starts_at: SOON,
    ends_at: SOON,
    location: 'Studio A',
    color_token: 'pink',
    seats_left: 4,
    is_full: false,
    waitlist_is_open: false,
  } as PublicClass;
}

const classes = [item('a', 'Bento cake'), item('b', 'Clay pots')];

/** Every element in the document that carries the shared-element name. */
function named() {
  return Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
    (el) => el.style.viewTransitionName === 'class-leaf',
  );
}

beforeEach(() => {
  withViewTransition.mockReset();
  withViewTransition.mockImplementation((update: () => void) => {
    update();
    return Promise.resolve();
  });
});

describe('ClassPicker', () => {
  it('carries nothing until a card is picked', () => {
    render(<ClassPicker classes={classes} onPick={() => {}} />);
    expect(named()).toHaveLength(0);
  });

  it('runs the pick as a view transition, naming only the picked card first', async () => {
    const onPick = vi.fn();
    let namedAtStart = -1;
    withViewTransition.mockImplementation((update: () => void) => {
      namedAtStart = named().length;
      update();
      return Promise.resolve();
    });

    render(<ClassPicker classes={classes} onPick={onPick} />);
    await userEvent.click(screen.getByRole('button', { name: /Clay pots/ }));

    expect(withViewTransition).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(classes[1]);
    // The name was already on exactly one element when the "before" photo was taken.
    expect(namedAtStart).toBe(1);
    expect(named()[0]?.closest('button')).toHaveAccessibleName(/Clay pots/);
  });

  it('ignores a second activation while the first is in flight', async () => {
    const onPick = vi.fn();
    // A transition that never settles: the first pick is still in flight.
    withViewTransition.mockImplementation(() => new Promise<void>(() => {}));

    render(<ClassPicker classes={classes} onPick={onPick} />);
    await userEvent.dblClick(screen.getByRole('button', { name: /Bento cake/ }));
    await userEvent.click(screen.getByRole('button', { name: /Clay pots/ }));

    expect(withViewTransition).toHaveBeenCalledTimes(1);
    expect(named()).toHaveLength(1);
  });

  it('lets the card being returned from carry the name, and only that card', () => {
    render(<ClassPicker classes={classes} onPick={() => {}} returnedFromId="b" />);

    expect(named()).toHaveLength(1);
    expect(named()[0]?.closest('button')).toHaveAccessibleName(/Clay pots/);
  });

  it('never has two carriers when a different card is picked after returning', async () => {
    render(<ClassPicker classes={classes} onPick={() => {}} returnedFromId="b" />);
    await userEvent.click(screen.getByRole('button', { name: /Bento cake/ }));

    expect(named()).toHaveLength(1);
    expect(named()[0]?.closest('button')).toHaveAccessibleName(/Bento cake/);
  });

  it('reads each class on one short line, not the long date', () => {
    const timed = {
      ...item('t', 'Wheel throwing'),
      starts_at: new Date(2026, 9, 23, 19, 54).toISOString(),
      ends_at: new Date(2026, 9, 23, 22, 24).toISOString(),
    };
    render(<ClassPicker classes={[timed]} onPick={() => {}} />);

    const button = screen.getByRole('button', { name: /Wheel throwing/ });
    expect(button).toHaveTextContent(whenLine(timed));
    expect(button).toHaveTextContent(/2½ h/);
    expect(button).not.toHaveTextContent(formatDay(timed.starts_at));
  });
});

describe('ClassPicker seats line', () => {
  it('reserves its height whatever the count says, so a corrected count moves nothing', () => {
    const full = { ...item('c', 'Wheel'), seats_left: 0, is_full: true } as PublicClass;
    render(<ClassPicker classes={[item('a', 'Bento cake'), full]} onPick={() => {}} />);

    const lines = document.querySelectorAll<HTMLElement>('[data-seats-line]');
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).toHaveClass('block', 'min-h-7');
    expect(lines[0]).toHaveTextContent('4 seats left');
    expect(lines[1]).toHaveTextContent(/join the waitlist/i);
  });
});

describe('ClassPicker cards', () => {
  it('renders one pop-up card per class, each with one button and a Maps link', () => {
    render(<ClassPicker classes={classes} onPick={() => {}} />);
    const cards = document.querySelectorAll<HTMLElement>('[data-popup-card]');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(within(card).getAllByRole('button')).toHaveLength(1);
      expect(within(card).getByRole('link', { name: /Maps/ })).toBeInTheDocument();
    }
  });
});

describe('ClassPicker craft filter', () => {
  const mixed = [
    { ...item('a', 'Bento cake'), color_token: 'pink' },
    { ...item('b', 'Clay pots'), color_token: 'terra' },
    { ...item('c', 'Watercolour'), color_token: 'sage' },
  ] as PublicClass[];

  it('shows no filter when every class is one craft', () => {
    render(<ClassPicker classes={classes} onPick={() => {}} />);
    expect(screen.queryByRole('group', { name: /craft/i })).toBeNull();
  });

  it('shows All first then a chip per craft, and narrows the list', async () => {
    render(<ClassPicker classes={mixed} onPick={() => {}} />);
    const group = screen.getByRole('group', { name: /craft/i });
    const chips = within(group).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(['All', 'Cake', 'Pottery', 'Painting']);
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(group).getByRole('button', { name: 'Pottery' }));
    expect(document.querySelectorAll('[data-popup-card]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Clay pots/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bento cake/ })).toBeNull();

    await userEvent.click(within(group).getByRole('button', { name: 'All' }));
    expect(document.querySelectorAll('[data-popup-card]')).toHaveLength(3);
  });
});

describe('ClassPicker with no classes', () => {
  it('shows the friendly card with the follow link', () => {
    render(<ClassPicker classes={[]} onPick={() => {}} handle="@MaisonAbeer" />);
    expect(screen.getByText(/next pop-up is coming/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /follow/i })).toHaveAttribute(
      'href',
      'https://instagram.com/maisonabeer',
    );
    expect(screen.queryByRole('group', { name: /craft/i })).toBeNull();
  });

  it('shows no follow link for an invalid or missing handle', () => {
    const { unmount } = render(
      <ClassPicker classes={[]} onPick={() => {}} handle="not a handle!" />,
    );
    expect(screen.getByText(/next pop-up is coming/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    unmount();
    render(<ClassPicker classes={[]} onPick={() => {}} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
