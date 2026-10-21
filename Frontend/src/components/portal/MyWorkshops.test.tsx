import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MyWorkshops } from './MyWorkshops';
import type { PortalWorkshop } from '@/lib/api/types';

/**
 * The guest's list: what it says when it is empty, when it fails, and that a
 * waitlisted class never vanishes from "upcoming".
 */

const refetch = vi.fn();
let workshops: Record<string, unknown>;

vi.mock('@/lib/api/hooks', () => ({
  usePortalProfile: () => ({ data: undefined }),
  usePortalWorkshops: () => workshops,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function workshop(overrides: Partial<PortalWorkshop> = {}): PortalWorkshop {
  return {
    session_id: 'session-1',
    booking_id: 'booking-1',
    name: 'Bento cake decorating',
    starts_at: new Date(2030, 7, 8, 14, 0).toISOString(),
    ends_at: new Date(2030, 7, 8, 16, 30).toISOString(),
    location: 'Studio A',
    color_token: 'pink',
    status: 'upcoming',
    attendee_count: 3,
    ...overrides,
  };
}

beforeEach(() => {
  refetch.mockReset();
});

describe('MyWorkshops', () => {
  it('says what to do when the list is empty, and never "undefined"', () => {
    workshops = { isPending: false, isError: false, isSuccess: true, data: [], refetch };
    const { container } = render(<MyWorkshops />);

    expect(screen.getByText('Nothing here yet…')).toBeInTheDocument();
    const hint = screen.getByText(
      'Booked already? It can take a minute to appear. Otherwise ask your studio for the booking link',
    );
    // Written in the hand face, like the other asides on the page.
    expect(hint.closest('.font-hand')).not.toBeNull();
    expect(container).not.toHaveTextContent('undefined');
  });

  it('shows an alert with a working Try again when the list fails', () => {
    workshops = {
      isPending: false,
      isError: true,
      isSuccess: false,
      data: undefined,
      error: new Error('boom'),
      refetch,
    };
    render(<MyWorkshops />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't load your workshops just now.",
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps a waitlisted class with the upcoming ones', () => {
    workshops = {
      isPending: false,
      isError: false,
      isSuccess: true,
      data: [
        workshop({ session_id: 's-wait', name: 'Wheel throwing', status: 'waitlisted' }),
        workshop({ session_id: 's-done', name: 'Candle pouring', status: 'completed' }),
      ],
      refetch,
    };
    render(<MyWorkshops />);

    const upcoming = screen.getByRole('list', { name: 'Upcoming workshops' });
    expect(within(upcoming).getByText('Wheel throwing')).toBeInTheDocument();
    const past = screen.getByRole('list', { name: 'Past workshops' });
    expect(within(past).getByText('Candle pouring')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet…')).not.toBeInTheDocument();
  });
});
