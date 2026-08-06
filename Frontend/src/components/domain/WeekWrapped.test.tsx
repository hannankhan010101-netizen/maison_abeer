import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WeekWrapped, badgesFor, summariseWeek, type WeekStats } from './WeekWrapped';
import type { Session } from '@/lib/api/types';

const NOW = new Date(2026, 7, 9, 20, 0);

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    class_type_id: 'ct-1',
    class_type_name: 'bento cake',
    color_token: 'pink',
    title: null,
    location: null,
    notes: null,
    starts_at: new Date(2026, 7, 8, 14, 0).toISOString(),
    ends_at: new Date(2026, 7, 8, 16, 30).toISOString(),
    status: 'scheduled',
    capacity: {
      seats: 10,
      booked: 8,
      available: 2,
      state: 'nearly_full',
      waitlist_is_open: false,
      accepts_bookings: true,
    },
    unassigned_guest_count: 0,
    roster_changed_since_export: false,
    ...overrides,
  };
}

function stats(overrides: Partial<WeekStats> = {}): WeekStats {
  return { classesHosted: 3, guestsTaught: 28, soldOut: 1, totalGuestsEver: 214, ...overrides };
}

describe('summariseWeek', () => {
  it('counts only classes that have finished', () => {
    const summary = summariseWeek(
      [
        session({ id: 'done' }),
        session({
          id: 'upcoming',
          starts_at: new Date(2026, 7, 12, 14).toISOString(),
          ends_at: new Date(2026, 7, 12, 16).toISOString(),
        }),
      ],
      NOW,
    );

    // Telling a host they hosted a class they have not yet taught is worse
    // than telling them nothing.
    expect(summary.classesHosted).toBe(1);
  });

  it('adds up the guests taught', () => {
    const summary = summariseWeek([session(), session({ id: 's2' })], NOW);
    expect(summary.guestsTaught).toBe(16);
  });

  it('counts sold-out classes', () => {
    const summary = summariseWeek(
      [session({ capacity: { ...session().capacity, state: 'sold_out' } }), session({ id: 's2' })],
      NOW,
    );

    expect(summary.soldOut).toBe(1);
  });

  it('is all zeros for an empty week', () => {
    expect(summariseWeek([], NOW)).toEqual({
      classesHosted: 0,
      guestsTaught: 0,
      soldOut: 0,
      totalGuestsEver: 0,
    });
  });
});

describe('badgesFor', () => {
  it('awards a sell-out badge with its count', () => {
    expect(badgesFor(stats({ soldOut: 2 }))).toContain('🎀 sold out ×2');
  });

  it('awards the hundredth guest', () => {
    expect(badgesFor(stats({ totalGuestsEver: 100 }))).toContain('🌷 100th guest');
    expect(badgesFor(stats({ totalGuestsEver: 99 }))).not.toContain('🌷 100th guest');
  });

  it('awards nothing for a quiet week', () => {
    expect(
      badgesFor({ classesHosted: 1, guestsTaught: 4, soldOut: 0, totalGuestsEver: 4 }),
    ).toEqual([]);
  });
});

describe('WeekWrapped', () => {
  it('renders the week', () => {
    render(<WeekWrapped stats={stats()} />);

    expect(screen.getByText('your week, wrapped 🎀')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('28')).toBeInTheDocument();
  });

  it('labels each number for assistive technology', () => {
    render(<WeekWrapped stats={stats()} />);

    // The visual layout pairs a big number with small text; a screen reader
    // needs that pairing to survive.
    expect(screen.getByText('classes hosted')).toBeInTheDocument();
    expect(screen.getByText('guests taught')).toBeInTheDocument();
  });

  it('shows earned milestones', () => {
    render(<WeekWrapped stats={stats()} />);

    expect(screen.getByText('🎀 sold out ×1')).toBeInTheDocument();
    expect(screen.getByText('🌷 100th guest')).toBeInTheDocument();
  });

  it('renders nothing before the first class of the week', () => {
    // A recap of zeros is not a celebration.
    const { container } = render(<WeekWrapped stats={stats({ classesHosted: 0 })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hides the decorative screenshot prompt from screen readers', () => {
    const { container } = render(<WeekWrapped stats={stats()} />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('screenshot me!');
  });
});
