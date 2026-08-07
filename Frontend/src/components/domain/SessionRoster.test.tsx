import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionRoster } from './SessionRoster';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';
import { ToastProvider } from '@/components/ui/Toast';
import type { Booking, Guest, Session } from '@/lib/api/types';

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

function guest(name: string, id = `guest-${name}`): Guest {
  return {
    id,
    full_name: name,
    phone: '03001234567',
    email: null,
    preferred_channel: 'whatsapp',
    opted_out: false,
    is_contactable: true,
    visit_count: 1,
    visit_badge: null,
    is_regular: false,
    birthday: null,
    days_until_birthday: null,
    memory_note: null,
    allergies: [],
    available_credits: 0,
  };
}

function booking(name: string, overrides: Partial<Booking> = {}): Booking {
  return {
    id: `booking-${name}`,
    guest: guest(name),
    status: 'confirmed',
    table_number: null,
    sit_with_note: null,
    booking_answers: null,
    ...overrides,
  };
}

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
      booked: 2,
      available: 8,
      state: 'filling',
      waitlist_is_open: false,
      accepts_bookings: true,
    },
    unassigned_guest_count: 0,
    roster_changed_since_export: false,
    ...overrides,
  };
}

function respondRoster(bookings: Booking[], unassigned = 0) {
  fetchImpl.mockImplementation(
    () =>
      new Response(
        JSON.stringify({
          session_id: 'session-1',
          bookings,
          unassigned_count: unassigned,
          critical_allergy_count: 0,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
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

function renderRoster(s: Session = session()) {
  return render(<SessionRoster session={s} />, { wrapper: Wrapper });
}

describe('SessionRoster', () => {
  beforeEach(() => fetchImpl.mockReset());

  it('lists the booked guests', async () => {
    respondRoster([booking('Sana R.'), booking('Ayesha K.')]);
    renderRoster();

    expect(await screen.findByText('Sana R.')).toBeInTheDocument();
    expect(screen.getByText('Ayesha K.')).toBeInTheDocument();
  });

  it('hides cancelled bookings', async () => {
    respondRoster([booking('Sana R.'), booking('Gone', { status: 'cancelled' })]);
    renderRoster();

    await screen.findByText('Sana R.');
    expect(screen.queryByText('Gone')).not.toBeInTheDocument();
  });

  it('counts guests still without a table', async () => {
    respondRoster([booking('Sana R.')], 1);
    renderRoster();

    expect(await screen.findByText('1 without a table')).toBeInTheDocument();
  });

  it('assigns a table by dropdown, not drag alone', async () => {
    respondRoster([booking('Sana R.')]);
    renderRoster();

    // The PRD requires a tap path on mobile (§2.4).
    const picker = await screen.findByLabelText('Table for Sana R.');
    await userEvent.selectOptions(picker, '2');

    await waitFor(() => {
      const patch = fetchImpl.mock.calls.find((c) => (c[1] as RequestInit).method === 'PATCH');
      expect(JSON.parse(String((patch![1] as RequestInit).body)).table_number).toBe(2);
    });
  });

  it('can unassign a table', async () => {
    respondRoster([booking('Sana R.', { table_number: 2 })]);
    renderRoster();

    const picker = await screen.findByLabelText('Table for Sana R.');
    await userEvent.selectOptions(picker, '');

    await waitFor(() => {
      const patch = fetchImpl.mock.calls.find((c) => (c[1] as RequestInit).method === 'PATCH');
      expect(JSON.parse(String((patch![1] as RequestInit).body)).table_number).toBeNull();
    });
  });

  it('says so when nobody is booked', async () => {
    respondRoster([]);
    renderRoster();

    expect(await screen.findByText(/Nobody booked in yet/)).toBeInTheDocument();
  });

  describe('waitlist', () => {
    it('is hidden when the waitlist is closed', async () => {
      respondRoster([booking('Sana R.')]);
      renderRoster();

      await screen.findByText('Sana R.');
      expect(screen.queryByRole('button', { name: 'Invite next' })).not.toBeInTheDocument();
    });

    it('offers an invite once a seat frees up', async () => {
      respondRoster([booking('Sana R.')]);
      renderRoster(
        session({
          capacity: { ...session().capacity, waitlist_is_open: true, available: 1 },
        }),
      );

      expect(await screen.findByRole('button', { name: 'Invite next' })).toBeEnabled();
    });

    it('disables the invite while the class is still full', async () => {
      respondRoster([booking('Sana R.')]);
      renderRoster(
        session({
          capacity: { ...session().capacity, waitlist_is_open: true, available: 0 },
        }),
      );

      expect(await screen.findByRole('button', { name: 'Invite next' })).toBeDisabled();
    });

    it("shows the API's reason when nobody could be invited", async () => {
      respondRoster([booking('Sana R.')]);
      renderRoster(
        session({ capacity: { ...session().capacity, waitlist_is_open: true, available: 1 } }),
      );

      const invite = await screen.findByRole('button', { name: 'Invite next' });

      fetchImpl.mockImplementation(
        () =>
          new Response(
            JSON.stringify({
              invited_guest_id: null,
              send_at: null,
              expired_count: 0,
              message: "Nobody's waiting right now.",
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      );

      await userEvent.click(invite);
      expect(await screen.findByTestId('toast')).toHaveTextContent("Nobody's waiting right now.");
    });
  });

  describe('cancelling', () => {
    it('offers a credit or a refund', async () => {
      respondRoster([booking('Sana R.')]);
      renderRoster();

      await userEvent.click(await screen.findByRole('button', { name: /Cancel Sana R./ }));

      expect(screen.getByRole('dialog')).toHaveAccessibleName(/cancel Sana R./i);
      expect(screen.getByLabelText(/Save a class credit/)).toBeChecked();
      expect(screen.getByLabelText(/Refunded them/)).not.toBeChecked();
    });

    it('sends the chosen resolution', async () => {
      respondRoster([booking('Sana R.')]);
      renderRoster();

      await userEvent.click(await screen.findByRole('button', { name: /Cancel Sana R./ }));
      await userEvent.click(screen.getByLabelText(/Refunded them/));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel the seat' }));

      await waitFor(() => {
        const post = fetchImpl.mock.calls.find((c) => String(c[0]).includes('/cancel'));
        expect(JSON.parse(String((post![1] as RequestInit).body)).resolution).toBe('refunded');
      });
    });

    it('defaults to a credit, which is the retention path', async () => {
      respondRoster([booking('Sana R.')]);
      renderRoster();

      await userEvent.click(await screen.findByRole('button', { name: /Cancel Sana R./ }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel the seat' }));

      await waitFor(() => {
        const post = fetchImpl.mock.calls.find((c) => String(c[0]).includes('/cancel'));
        expect(JSON.parse(String((post![1] as RequestInit).body)).resolution).toBe('credit');
      });
    });

    it('can be backed out of', async () => {
      respondRoster([booking('Sana R.')]);
      renderRoster();

      await userEvent.click(await screen.findByRole('button', { name: /Cancel Sana R./ }));
      await userEvent.click(screen.getByRole('button', { name: 'Keep the booking' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
