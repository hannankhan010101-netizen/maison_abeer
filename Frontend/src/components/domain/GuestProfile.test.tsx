import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Message button routes into the guest's private thread, so the profile
// now needs a router. Same shape as CalendarView's mock.
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/guests',
}));

import { GuestProfile } from './GuestProfile';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';
import type { Guest, GuestHistory, ScheduledMessage } from '@/lib/api/types';

/**
 * The mini-CRM (PRD §2.4).
 *
 * Weighted towards the two things that decide whether it is useful at the
 * door: that a critical allergy is impossible to miss, and that a failed
 * message is visible rather than buried.
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

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-1',
    full_name: 'Ayesha K.',
    phone: '03002222222',
    email: null,
    preferred_channel: 'whatsapp',
    opted_out: false,
    is_contactable: true,
    visit_count: 2,
    visit_badge: '2nd visit',
    is_regular: false,
    birthday: null,
    days_until_birthday: null,
    memory_note: 'Surprise from her sister — bring the candle',
    allergies: [],
    available_credits: 0,
    ...overrides,
  };
}

function history(overrides: Partial<GuestHistory> = {}): GuestHistory {
  return {
    guest_id: 'guest-1',
    visits: [],
    credits: [],
    attended_count: 0,
    upcoming_count: 0,
    available_credit_count: 0,
    ...overrides,
  };
}

function respond({
  person = guest(),
  past = history(),
  messages = [] as ScheduledMessage[],
}: {
  person?: Guest;
  past?: GuestHistory;
  messages?: ScheduledMessage[];
} = {}) {
  fetchImpl.mockImplementation((url: string) => {
    const path = String(url);

    let body: unknown = person;
    if (path.includes('/history')) body = past;
    else if (path.includes('/messages')) body = messages;
    else if (path.endsWith('/chat'))
      body = { id: 'room-direct-1', kind: 'direct', name: 'Sana R.' };

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

beforeEach(() => fetchImpl.mockReset());

describe('GuestProfile', () => {
  it('leads with the name and their memory note', async () => {
    respond();

    render(<GuestProfile guestId="guest-1" />, { wrapper: Wrapper });

    expect(await screen.findByRole('heading', { name: 'Ayesha K.' })).toBeInTheDocument();
    expect(screen.getByText(/bring the candle/)).toBeInTheDocument();
  });

  it('raises a critical allergy above everything else', async () => {
    respond({
      person: guest({
        allergies: [
          {
            id: 'a1',
            label: 'Nut allergy',
            severity: 'severe',
            notes: 'No traces, please',
            is_critical: true,
          },
        ],
      }),
    });

    render(<GuestProfile guestId="guest-1" />, { wrapper: Wrapper });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nut allergy');
    expect(alert).toHaveTextContent('No traces, please');
  });

  it('does not raise an alert for a preference', async () => {
    respond({
      person: guest({
        allergies: [
          {
            id: 'a2',
            label: 'No coriander',
            severity: 'preference',
            notes: null,
            is_critical: false,
          },
        ],
      }),
    });

    render(<GuestProfile guestId="guest-1" />, { wrapper: Wrapper });

    await screen.findByRole('heading', { name: 'Ayesha K.' });
    // Still listed, but not escalated — over-alerting dilutes the real one.
    expect(screen.getByText('No coriander')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lists their classes and marks the upcoming one', async () => {
    respond({
      past: history({
        attended_count: 1,
        upcoming_count: 1,
        visits: [
          {
            booking_id: 'b1',
            session_id: 's1',
            class_name: 'Bento cake decorating',
            starts_at: new Date(Date.now() + 86_400_000).toISOString(),
            location: 'Studio A',
            status: 'confirmed',
            table_number: 2,
            is_upcoming: true,
          },
        ],
      }),
    });

    render(<GuestProfile guestId="guest-1" />, { wrapper: Wrapper });

    const list = await screen.findByRole('list', { name: 'Class history' });
    expect(list).toHaveTextContent('Bento cake decorating');
    expect(list).toHaveTextContent('Coming up');
  });

  it('says so warmly when they have never been', async () => {
    respond();

    render(<GuestProfile guestId="guest-1" />, { wrapper: Wrapper });

    expect(await screen.findByText(/first one is still to come/)).toBeInTheDocument();
  });

  it('shows why a message failed rather than hiding it', async () => {
    respond({
      messages: [
        {
          id: 'm1',
          session_id: 's1',
          guest_id: 'guest-1',
          kind: 'guest_reminder',
          channel: 'whatsapp',
          status: 'failed',
          send_at: new Date().toISOString(),
          sent_at: null,
          body: 'See you tomorrow!',
          attempt_count: 2,
          last_error: 'Number unreachable',
        },
      ],
    });

    render(<GuestProfile guestId="guest-1" />, { wrapper: Wrapper });

    const log = await screen.findByRole('list', { name: 'Message history' });
    expect(log).toHaveTextContent('Number unreachable');
  });

  it('flags a guest nobody can reach', async () => {
    respond({ person: guest({ phone: null, email: null, is_contactable: false }) });

    render(<GuestProfile guestId="guest-1" />, { wrapper: Wrapper });

    expect(await screen.findByText('No way to reach them')).toBeInTheDocument();
  });

  it('recovers when the guest does not exist', async () => {
    fetchImpl.mockImplementation(
      () =>
        new Response(JSON.stringify({ code: 'not_found', message: "We couldn't find that." }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    );

    render(<GuestProfile guestId="nope" />, { wrapper: Wrapper });

    expect(await screen.findByRole('link', { name: 'Back to guests' })).toBeInTheDocument();
  });

  it('opens a private thread and lands the host in it', async () => {
    // The whole point of the button: one press should end with the host
    // looking at that guest's conversation, not back on the room list.
    respond();

    render(<GuestProfile guestId="guest-1" />, { wrapper: Wrapper });

    const button = await screen.findByRole('button', { name: /Message Ayesha K. privately/i });
    await userEvent.click(button);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/chat?room=room-direct-1'));
  });

  it('names the guest in the button label, not just the icon', async () => {
    // A row of identical ✿ buttons is unusable on a screen reader.
    respond();

    render(<GuestProfile guestId="guest-1" />, { wrapper: Wrapper });

    expect(
      await screen.findByRole('button', { name: /Message Ayesha K. privately/i }),
    ).toBeInTheDocument();
  });
});
