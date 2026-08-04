import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarView } from './CalendarView';
import { toneFor } from './SessionChip';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';
import { ToastProvider } from '@/components/ui/Toast';
import type { Session } from '@/lib/api/types';

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

// Tuesday 2026-08-04; its week runs Mon 3rd to Sun 9th.
const NOW = new Date(2026, 7, 4, 10, 0);

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

function respondWith(sessions: Session[]): void {
  fetchImpl.mockImplementation(
    () =>
      new Response(JSON.stringify(sessions), {
        status: 200,
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

function renderCalendar() {
  return render(<CalendarView now={NOW} />, { wrapper: Wrapper });
}

describe('toneFor', () => {
  it('maps craft tokens to their signature colours', () => {
    // The colour is how a host identifies a class type at a glance.
    expect(toneFor('terra')).toContain('terra');
    expect(toneFor('sage')).toContain('sage');
  });

  it('falls back rather than rendering an unstyled chip', () => {
    expect(toneFor('unknown-token')).toBeTruthy();
  });
});

describe('CalendarView', () => {
  beforeEach(() => {
    fetchImpl.mockReset();
  });

  it('announces loading', async () => {
    fetchImpl.mockImplementation(() => new Promise(() => {}));
    renderCalendar();

    expect(await screen.findByText('Loading your week…')).toBeInTheDocument();
  });

  it('requests the Monday-to-Sunday window', async () => {
    respondWith([]);
    renderCalendar();

    await screen.findAllByText(/nothing scheduled/);

    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(new Date(url.searchParams.get('start')!).getDate()).toBe(3);
    expect(new Date(url.searchParams.get('end')!).getDate()).toBe(9);
  });

  it('renders the same session in both layouts', async () => {
    respondWith([session()]);
    renderCalendar();

    // One agenda row and one grid cell, from a single dataset.
    const chips = await screen.findAllByRole('button', { name: /bento cake/ });
    expect(chips).toHaveLength(2);
  });

  it('gives a session a spoken label rather than reading "8/10"', async () => {
    respondWith([session()]);
    renderCalendar();

    const [chip] = await screen.findAllByRole('button', { name: /bento cake/ });
    expect(chip).toHaveAccessibleName(/8 of 10 seats booked/);
  });

  it('says a locked class is closed to new bookings', async () => {
    respondWith([session({ status: 'locked' })]);
    renderCalendar();

    const [chip] = await screen.findAllByRole('button', { name: /bento cake/ });
    expect(chip).toHaveAccessibleName(/closed to new bookings/);
  });

  it('marks empty days rather than leaving a blank column', async () => {
    respondWith([]);
    renderCalendar();

    // Seven agenda days, all empty — and each offers to add a class.
    expect(await screen.findAllByText(/nothing scheduled/)).toHaveLength(7);
  });

  it('labels today', async () => {
    respondWith([]);
    renderCalendar();

    expect(await screen.findByText(/tue 4 · today/)).toBeInTheDocument();
  });

  it('moves to the next week and refetches', async () => {
    respondWith([]);
    renderCalendar();
    await screen.findAllByText(/nothing scheduled/);

    await userEvent.click(screen.getByRole('button', { name: 'next →' }));

    const last = new URL(String(fetchImpl.mock.calls.at(-1)![0]));
    // Week of Mon 10th.
    expect(new Date(last.searchParams.get('start')!).getDate()).toBe(10);
  });

  it('moves to the previous week', async () => {
    respondWith([]);
    renderCalendar();
    await screen.findAllByText(/nothing scheduled/);

    await userEvent.click(screen.getByRole('button', { name: '← previous' }));

    const last = new URL(String(fetchImpl.mock.calls.at(-1)![0]));
    expect(new Date(last.searchParams.get('start')!).getDate()).toBe(27);
  });

  it('returns to the current week', async () => {
    respondWith([]);
    renderCalendar();
    await screen.findAllByText(/nothing scheduled/);

    await userEvent.click(screen.getByRole('button', { name: 'next →' }));
    await userEvent.click(screen.getByRole('button', { name: 'this week' }));

    const last = new URL(String(fetchImpl.mock.calls.at(-1)![0]));
    expect(new Date(last.searchParams.get('start')!).getDate()).toBe(3);
  });

  it('surfaces the API message on failure', async () => {
    fetchImpl.mockImplementation(
      () =>
        new Response(JSON.stringify({ code: 'rate_limited', message: 'Give it a moment.' }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    );

    renderCalendar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Give it a moment.');
  });

  it('gives every control a 44px touch target', async () => {
    respondWith([]);
    renderCalendar();
    await screen.findAllByText(/nothing scheduled/);

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('min-h-[44px]');
    }
  });
});
