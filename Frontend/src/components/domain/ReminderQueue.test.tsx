import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReminderQueue } from './ReminderQueue';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';
import type { Session } from '@/lib/api/types';

/**
 * The reminder queue.
 *
 * `now = new Date()` as a default prop gave the session window — and so the
 * React Query key — a new value on every render. Each render started a fetch
 * whose resolution caused the next render, which is why this card showed no
 * class picker and no buttons while the browser refetched in a loop.
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

const NOW = new Date(2026, 7, 4, 10, 0);

const SESSION: Session = {
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
    booked: 4,
    available: 6,
    state: 'filling',
    waitlist_is_open: false,
    accepts_bookings: true,
  },
  unassigned_guest_count: 0,
  roster_changed_since_export: false,
};

function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function withProviders(node: ReactNode) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });

  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function sessionRequests(): string[] {
  return fetchImpl.mock.calls
    .map((args) => new URL(String(args[0])))
    .filter((url) => url.pathname === '/api/v1/sessions')
    .map((url) => url.search);
}

describe('ReminderQueue', () => {
  beforeEach(() => {
    fetchImpl.mockReset();
    fetchImpl.mockImplementation(() => reply([SESSION]));
  });

  it('asks for its session window exactly once', async () => {
    render(withProviders(<ReminderQueue now={NOW} />));

    await screen.findByRole('button', { name: 'Queue reminders' });
    // Settle anything a resolved query kicked off.
    await waitFor(() => expect(sessionRequests().length).toBeGreaterThan(0));

    expect(sessionRequests()).toHaveLength(1);
  });

  it('shows the class picker and its controls once the window loads', async () => {
    render(withProviders(<ReminderQueue now={NOW} />));

    expect(await screen.findByRole('button', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Queue reminders' })).toBeInTheDocument();
  });

  it('includes classes that have already started, so post-class steps stay reachable', async () => {
    render(withProviders(<ReminderQueue now={NOW} />));

    await screen.findByRole('button', { name: 'Queue reminders' });

    const start = new Date(new URLSearchParams(sessionRequests()[0]!).get('start')!);

    expect(start.getTime()).toBeLessThan(NOW.getTime());
  });

  it('says so plainly when there is nothing scheduled', async () => {
    fetchImpl.mockImplementation(() => reply([]));
    render(withProviders(<ReminderQueue now={NOW} />));

    expect(await screen.findByText(/Schedule a class and its reminders/)).toBeInTheDocument();
  });
});
