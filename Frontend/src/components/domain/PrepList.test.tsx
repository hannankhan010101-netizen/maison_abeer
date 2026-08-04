import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrepList, groupByDeadline } from './PrepList';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';
import type { ChecklistItem, Session } from '@/lib/api/types';

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

function item(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: 'item-1',
    text: 'bake cake bases',
    quantity: 12,
    hours_before: 24,
    t_minus_label: 'T-24h',
    deadline_at: new Date(2026, 7, 7, 14, 0).toISOString(),
    status: 'upcoming',
    phase: 'prep',
    is_high_priority: false,
    is_one_off: false,
    completed_at: null,
    needs_attention: false,
    ...overrides,
  };
}

function session(): Session {
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
  };
}

function respond(items: ChecklistItem[], sessions: Session[] = [session()]) {
  fetchImpl.mockImplementation((url: string) => {
    const isChecklist = String(url).includes('/checklist');

    const body = isChecklist
      ? {
          session_id: 'session-1',
          items,
          completed_count: items.filter((i) => i.completed_at !== null).length,
          total_count: items.length,
          overdue_count: items.filter((i) => i.status === 'overdue').length,
        }
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

function renderPrep() {
  return render(<PrepList now={NOW} />, { wrapper: Wrapper });
}

describe('groupByDeadline', () => {
  it('groups steps by their T-minus moment', () => {
    const groups = groupByDeadline([
      item({ id: 'a', t_minus_label: 'T-24h', hours_before: 24 }),
      item({ id: 'b', t_minus_label: 'T-1h', hours_before: 1 }),
      item({ id: 'c', t_minus_label: 'T-24h', hours_before: 24 }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]![1]).toHaveLength(2);
  });

  it('orders the furthest-out group first', () => {
    // A host works forwards: everything due tomorrow, then everything due
    // in an hour.
    const groups = groupByDeadline([
      item({ id: 'a', t_minus_label: 'T-1h', hours_before: 1 }),
      item({ id: 'b', t_minus_label: 'T-24h', hours_before: 24 }),
    ]);

    expect(groups.map(([label]) => label)).toEqual(['T-24h', 'T-1h']);
  });

  it('handles an empty checklist', () => {
    expect(groupByDeadline([])).toEqual([]);
  });
});

describe('PrepList', () => {
  beforeEach(() => {
    fetchImpl.mockReset();
  });

  it('shows progress toward finishing', async () => {
    respond([item({ id: 'a', completed_at: NOW.toISOString() }), item({ id: 'b' })]);
    renderPrep();

    expect(await screen.findByText("1 of 2 to go — you're so close")).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Prep progress' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
  });

  it('celebrates a finished checklist', async () => {
    respond([item({ completed_at: NOW.toISOString() })]);
    renderPrep();

    expect(await screen.findByText('all set — nice work 🎀')).toBeInTheDocument();
  });

  it('groups steps under their T-minus heading', async () => {
    respond([
      item({ id: 'a', t_minus_label: 'T-24h', hours_before: 24 }),
      item({ id: 'b', t_minus_label: 'T-1h', hours_before: 1, text: 'set out sprinkles' }),
    ]);
    renderPrep();

    expect(await screen.findByText('T-24h')).toBeInTheDocument();
    expect(screen.getByText('T-1h')).toBeInTheDocument();
  });

  it('shows the auto-scaled quantity', async () => {
    respond([item({ quantity: 12 })]);
    renderPrep();

    expect(await screen.findByText('12')).toBeInTheDocument();
  });

  it('tells the host when seats changed after a step was ticked', async () => {
    respond([item({ completed_at: NOW.toISOString(), needs_attention: true })]);
    renderPrep();

    // PRD §2.5: prep and capacity can never silently drift apart.
    expect(await screen.findByText('seats changed after you ticked this')).toBeInTheDocument();
  });

  it('flags overdue steps', async () => {
    respond([item({ status: 'overdue' })]);
    renderPrep();

    expect(await screen.findByText('1 step past due')).toBeInTheDocument();
    expect(screen.getByText(/don't forget!/)).toBeInTheDocument();
  });

  it('separates the post-class reset list', async () => {
    respond([
      item({ id: 'a', text: 'bake cake bases' }),
      item({ id: 'b', text: 'wash piping tips', phase: 'post_class', hours_before: -2 }),
    ]);
    renderPrep();

    expect(await screen.findByText('after class · reset')).toBeInTheDocument();
    expect(screen.getByText('wash piping tips')).toBeInTheDocument();
  });

  it('marks a one-off step as belonging to this date only', async () => {
    respond([item({ is_one_off: true, text: "ayesha's birthday candle" })]);
    renderPrep();

    expect(await screen.findByText('just this date')).toBeInTheDocument();
  });

  it('sends a tick to the API', async () => {
    respond([item()]);
    renderPrep();

    await screen.findByText('bake cake bases');
    await userEvent.click(screen.getByRole('checkbox'));

    await waitFor(() => {
      const patched = fetchImpl.mock.calls.find(
        (call) => (call[1] as RequestInit).method === 'PATCH',
      );
      expect(patched).toBeDefined();
      expect((patched![1] as RequestInit).body).toBe('{"completed":true}');
    });
  });

  it('promises the streak resets without shame', async () => {
    respond([item()]);
    renderPrep();

    // Gamification here is celebratory only (PRD §2.5).
    expect(await screen.findByText(/no shame copy, ever/)).toBeInTheDocument();
  });

  it('says so when there is nothing to prep', async () => {
    respond([], []);
    renderPrep();

    expect(await screen.findByText('nothing to prep yet')).toBeInTheDocument();
  });
});
