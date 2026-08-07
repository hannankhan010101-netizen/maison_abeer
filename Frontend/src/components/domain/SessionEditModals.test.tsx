import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RescheduleModal, SeatModal } from './SessionEditModals';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';
import { ToastProvider } from '@/components/ui/Toast';
import type { RescheduleImpact, Session } from '@/lib/api/types';

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

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    class_type_id: 'ct-1',
    class_type_name: 'Bento cake',
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

function impact(overrides: Partial<RescheduleImpact> = {}): RescheduleImpact {
  return {
    previous_start: new Date(2026, 7, 8, 14, 0).toISOString(),
    new_start: new Date(2026, 7, 9, 14, 0).toISOString(),
    moves_earlier: false,
    affected_guest_count: 8,
    contactable_guest_count: 8,
    requires_guest_notification: true,
    deadline_shifts: [
      {
        item_id: 'i1',
        label: 'Bake cake bases',
        previous_deadline: new Date(2026, 7, 7, 14, 0).toISOString(),
        new_deadline: new Date(2026, 7, 8, 14, 0).toISOString(),
        becomes_overdue_immediately: false,
      },
    ],
    newly_overdue_count: 0,
    ...overrides,
  };
}

function respond(status: number, body: unknown) {
  fetchImpl.mockImplementation(
    () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

describe('SeatModal', () => {
  beforeEach(() => fetchImpl.mockReset());

  it('shows the current booking position', () => {
    render(<SeatModal session={session()} open onClose={() => {}} />, { wrapper: Wrapper });

    expect(screen.getByText('8 of 10 seats are booked.')).toBeInTheDocument();
  });

  it('sends the new seat count', async () => {
    respond(200, session({ capacity: { ...session().capacity, seats: 12 } }));
    render(<SeatModal session={session()} open onClose={() => {}} />, { wrapper: Wrapper });

    const input = screen.getByLabelText('Seats');
    await userEvent.clear(input);
    await userEvent.type(input, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const patch = fetchImpl.mock.calls.find((c) => (c[1] as RequestInit).method === 'PATCH');
    expect((patch![1] as RequestInit).body).toBe('{"seats":12}');
  });

  it("shows the API's refusal verbatim rather than restating it", async () => {
    respond(409, {
      code: 'seats_below_bookings',
      message: 'You have 8 guests booked, so you cannot drop to 6 seats.',
    });

    render(<SeatModal session={session()} open onClose={() => {}} />, { wrapper: Wrapper });

    const input = screen.getByLabelText('Seats');
    await userEvent.clear(input);
    await userEvent.type(input, '6');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The backend wrote host-facing copy; the UI must not replace it.
    expect(
      await screen.findByText('You have 8 guests booked, so you cannot drop to 6 seats.'),
    ).toBeInTheDocument();
  });

  it('stays open after a refusal so the value can be corrected', async () => {
    respond(409, { code: 'seats_below_bookings', message: 'Too few.' });
    const onClose = vi.fn();

    render(<SeatModal session={session()} open onClose={onClose} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Too few.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers a hand-off to rescheduling', async () => {
    const onRequestMove = vi.fn();
    render(
      <SeatModal session={session()} open onClose={() => {}} onRequestMove={onRequestMove} />,
      { wrapper: Wrapper },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Move this class instead' }));
    expect(onRequestMove).toHaveBeenCalled();
  });
});

describe('RescheduleModal', () => {
  beforeEach(() => fetchImpl.mockReset());

  it('previews before saving anything', async () => {
    respond(200, { preview: true, impact: impact() });

    render(<RescheduleModal session={session()} open onClose={() => {}} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'See what changes' }));

    // The impact step replaces the form.
    expect(await screen.findByRole('button', { name: 'Confirm move' })).toBeInTheDocument();
    expect(screen.getByText(/guests? booked in/)).toBeInTheDocument();
    expect(screen.queryByLabelText('New date & time')).not.toBeInTheDocument();

    // Exactly one call so far — the preview. Nothing has been written.
    expect(fetchImpl.mock.calls).toHaveLength(1);
    expect(JSON.parse(String((fetchImpl.mock.calls[0]![1] as RequestInit).body)).confirm).toBe(
      false,
    );
  });

  it('lists the deadlines that shift', async () => {
    respond(200, { preview: true, impact: impact() });

    render(<RescheduleModal session={session()} open onClose={() => {}} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'See what changes' }));

    expect(await screen.findByText(/Bake cake bases/)).toBeInTheDocument();
  });

  it('warns when steps would land already overdue', async () => {
    respond(200, {
      preview: true,
      impact: impact({ newly_overdue_count: 2, moves_earlier: true }),
    });

    render(<RescheduleModal session={session()} open onClose={() => {}} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'See what changes' }));

    expect(await screen.findByText(/2 steps would already be overdue/)).toBeInTheDocument();
  });

  it('notes guests who cannot be messaged', async () => {
    respond(200, {
      preview: true,
      impact: impact({ affected_guest_count: 8, contactable_guest_count: 6 }),
    });

    render(<RescheduleModal session={session()} open onClose={() => {}} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'See what changes' }));

    // The host has to reach those two personally (PRD §2.4).
    expect(await screen.findByText(/2 can’t be messaged/)).toBeInTheDocument();
  });

  it('confirms with the notify choice', async () => {
    respond(200, { preview: true, impact: impact() });

    render(<RescheduleModal session={session()} open onClose={() => {}} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'See what changes' }));
    await screen.findByRole('button', { name: 'Confirm move' });

    respond(200, { preview: false, session: session(), impact: impact() });
    await userEvent.click(screen.getByRole('button', { name: 'Confirm move' }));

    const confirmCall = fetchImpl.mock.calls.at(-1)!;
    const body = JSON.parse(String((confirmCall[1] as RequestInit).body));
    expect(body.confirm).toBe(true);
    expect(body.notify_guests).toBe(true);
  });

  it('lets the host go back and change the slot', async () => {
    respond(200, { preview: true, impact: impact() });

    render(<RescheduleModal session={session()} open onClose={() => {}} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'See what changes' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText('New date & time')).toBeInTheDocument();
  });

  it('shows why a past slot was refused', async () => {
    respond(422, { code: 'past_slot', message: 'That slot is in the past.' });

    render(<RescheduleModal session={session()} open onClose={() => {}} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'See what changes' }));

    expect(await screen.findByText('That slot is in the past.')).toBeInTheDocument();
  });
});
