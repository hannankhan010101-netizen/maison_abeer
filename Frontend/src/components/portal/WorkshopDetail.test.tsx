import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkshopDetail } from './WorkshopDetail';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';
import type { PortalWorkshopDetail } from '@/lib/api/types';

/**
 * One workshop, as a guest sees it.
 *
 * The page used to label only `cancelled`, so a guest third in a queue landed
 * on something visually indistinguishable from a confirmed booking — no chip,
 * no position, and a roster underneath telling them they were going. And a
 * held seat showed "it's yours if you want it" with the clock nowhere on the
 * page, so the hold quietly expired.
 */

const fetchImpl = vi.fn();

vi.mock('@/lib/api/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/provider')>();

  return {
    ...actual,
    useApi: () =>
      new ApiClient({
        baseUrl: 'https://api.test',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
  };
});

function detail(overrides: Partial<PortalWorkshopDetail> = {}): PortalWorkshopDetail {
  return {
    session_id: 'session-1',
    booking_id: 'booking-1',
    name: 'Bento cake decorating',
    starts_at: new Date(2026, 7, 8, 14, 0).toISOString(),
    ends_at: new Date(2026, 7, 8, 16, 30).toISOString(),
    location: 'Studio A',
    color_token: 'pink',
    status: 'upcoming',
    attendee_count: 3,
    notes: null,
    attendees: [
      { guest_id: 'g1', display_name: 'Sana R.', is_you: true },
      { guest_id: 'g2', display_name: 'Ayesha K.', is_you: false },
    ],
    others_count: 1,
    ...overrides,
  };
}

function respond(item: PortalWorkshopDetail) {
  fetchImpl.mockImplementation(
    () =>
      new Response(JSON.stringify(item), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function show() {
  return render(<WorkshopDetail sessionId="session-1" />, { wrapper: Wrapper });
}

describe('WorkshopDetail', () => {
  beforeEach(() => fetchImpl.mockReset());

  it('labels a confirmed booking', async () => {
    respond(detail());
    show();

    expect(await screen.findByText('Upcoming')).toBeInTheDocument();
  });

  it('says a waitlisted guest is waiting, and where', async () => {
    respond(detail({ status: 'waitlisted', waitlist_position: 3 }));
    show();

    expect(await screen.findByText('On the waitlist')).toBeInTheDocument();
    expect(screen.getByText('#3 in the queue')).toBeInTheDocument();
  });

  it('does not tell a waitlisted guest they are going', async () => {
    respond(detail({ status: 'waitlisted', waitlist_position: 3 }));
    show();

    await screen.findByText('On the waitlist');

    // A chip that says "waiting" above a sentence that says "you + 1 other
    // are going" is worse than either alone.
    expect(screen.queryByText(/are going/)).not.toBeInTheDocument();
    expect(screen.getByText('2 going')).toBeInTheDocument();
  });

  it('shows the deadline on a held seat', async () => {
    respond(
      detail({
        status: 'invited',
        invite_expires_at: new Date(Date.now() + 6 * 3_600_000).toISOString(),
      }),
    );
    show();

    expect(await screen.findByText('Seat held for you')).toBeInTheDocument();
    expect(screen.getByText(/Yours until/)).toBeInTheDocument();
  });

  it('says a hold has run out rather than printing a past time', async () => {
    respond(
      detail({
        status: 'invited',
        invite_expires_at: new Date(Date.now() - 3_600_000).toISOString(),
      }),
    );
    show();

    // The API still reports `invited` without comparing the hold to the
    // clock, so this state is reachable.
    expect(await screen.findByText(/hold on this seat has run out/)).toBeInTheDocument();
    expect(screen.queryByText(/Yours until/)).not.toBeInTheDocument();
  });

  it('keeps the cancelled sentence, not just a chip', async () => {
    respond(detail({ status: 'cancelled' }));
    show();

    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText('This workshop was cancelled.')).toBeInTheDocument();
  });
});
