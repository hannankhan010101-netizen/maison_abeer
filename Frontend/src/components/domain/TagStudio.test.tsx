import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TagStudio } from './TagStudio';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';
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

const NOW = new Date(2026, 7, 4, 10, 0);

function guest(name: string): Guest {
  return {
    id: `guest-${name}`,
    full_name: name,
    phone: null,
    email: null,
    preferred_channel: 'whatsapp',
    opted_out: false,
    is_contactable: false,
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
    table_number: 2,
    sit_with_note: null,
    booking_answers: null,
    ...overrides,
  };
}

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

function respond({ sessions = [], bookings = [] }: { sessions?: Session[]; bookings?: Booking[] }) {
  fetchImpl.mockImplementation((url: string) => {
    const body = String(url).includes('/roster')
      ? { session_id: 'session-1', bookings, unassigned_count: 0, critical_allergy_count: 0 }
      : sessions;

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderStudio() {
  return render(<TagStudio now={NOW} />, { wrapper: Wrapper });
}

describe('TagStudio', () => {
  beforeEach(() => {
    fetchImpl.mockReset();
  });

  it('renders a tag per booked guest', async () => {
    respond({ sessions: [session()], bookings: [booking('Sana R.'), booking('Ayesha K.')] });
    renderStudio();

    expect(await screen.findByText('Sana R.')).toBeInTheDocument();
    expect(screen.getByText('Ayesha K.')).toBeInTheDocument();
  });

  it('does not print a tag for a cancelled booking', async () => {
    respond({
      sessions: [session()],
      bookings: [booking('Sana R.'), booking('Gone', { status: 'cancelled' })],
    });
    renderStudio();

    await screen.findByText('Sana R.');
    expect(screen.queryByText('Gone')).not.toBeInTheDocument();
  });

  it('preselects the theme matching the class colour', async () => {
    respond({ sessions: [session({ color_token: 'terra' })], bookings: [booking('Sana')] });
    renderStudio();

    expect(await screen.findByRole('button', { name: /clay & terracotta/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('lets the host override the theme', async () => {
    respond({ sessions: [session()], bookings: [booking('Sana')] });
    renderStudio();

    await screen.findByText('Sana');
    await userEvent.click(screen.getByRole('button', { name: /autumn drop/ }));

    expect(screen.getByRole('button', { name: /autumn drop/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('badges the seasonal drop', async () => {
    respond({ sessions: [session()], bookings: [] });
    renderStudio();

    expect(await screen.findByText('NEW')).toBeInTheDocument();
  });

  it('hides table numbers when the toggle is off', async () => {
    respond({ sessions: [session()], bookings: [booking('Sana')] });
    renderStudio();

    expect(await screen.findByText('table 2')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('table number'));
    expect(screen.queryByText('table 2')).not.toBeInTheDocument();
  });

  it('shows fun booking answers as subtext', async () => {
    respond({
      sessions: [session()],
      bookings: [booking('Sana', { booking_answers: { flavour: 'team gulab jamun 🍮' } })],
    });
    renderStudio();

    expect(await screen.findByText('team gulab jamun 🍮')).toBeInTheDocument();
  });

  it('warns when the roster drifted from the last export', async () => {
    respond({ sessions: [session({ roster_changed_since_export: true })], bookings: [] });
    renderStudio();

    // The printed set would no longer match who is coming.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'roster updated since your last export',
    );
  });

  it('names guests still missing a table', async () => {
    respond({
      sessions: [session()],
      bookings: [booking('Sana'), booking('Hira', { table_number: null })],
    });
    renderStudio();

    // Warning tier, so deliberately not role="alert": a missing table is a
    // nudge, not something that should interrupt what the host is doing.
    expect(await screen.findByText('1 guest without a table')).toBeInTheDocument();
    // Names the guest, so the host knows who to seat. ("Hira" also appears as
    // a tag, hence matching the warning's own sentence.)
    expect(screen.getByText(/Hira — assign them/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stops warning about tables once they are hidden', async () => {
    respond({ sessions: [session()], bookings: [booking('Hira', { table_number: null })] });
    renderStudio();

    await screen.findByText('1 guest without a table');
    await userEvent.click(screen.getByLabelText('table number'));

    // Nothing to fix once the number is not being printed.
    expect(screen.queryByText('1 guest without a table')).not.toBeInTheDocument();
  });

  it('reports the sheet count', async () => {
    respond({ sessions: [session()], bookings: [booking('a'), booking('b')] });
    renderStudio();

    expect(await screen.findByText(/2 tags · 1 page/)).toBeInTheDocument();
  });

  it('disables export with nothing to print', async () => {
    respond({ sessions: [session()], bookings: [] });
    renderStudio();

    expect(await screen.findByRole('button', { name: /export print PDF/ })).toBeDisabled();
  });

  it('says so when there are no upcoming classes', async () => {
    respond({ sessions: [] });
    renderStudio();

    expect(await screen.findByText('no upcoming classes')).toBeInTheDocument();
  });
});
