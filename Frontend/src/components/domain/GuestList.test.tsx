import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GuestList } from './GuestList';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';
import { ToastProvider } from '@/components/ui/Toast';
import type { Guest } from '@/lib/api/types';

/**
 * Exercises the roster against a mocked transport, so loading, empty, error
 * and populated states are all covered without a running API.
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
    full_name: 'Sana R.',
    phone: '03001234567',
    email: null,
    preferred_channel: 'whatsapp',
    opted_out: false,
    is_contactable: true,
    visit_count: 4,
    visit_badge: '4th visit',
    is_regular: true,
    birthday: null,
    days_until_birthday: null,
    memory_note: null,
    allergies: [],
    available_credits: 0,
    ...overrides,
  };
}

/**
 * A fresh Response per call.
 *
 * `mockResolvedValue(new Response(...))` hands back the *same* object every
 * time, and a body can only be read once — so the second request of a test
 * fails with a consumed-stream error that looks like a component bug.
 */
/**
 * Routes each query to its own payload.
 *
 * The screen now loads sessions (for the roster) as well as guests, so a
 * single blanket response would feed a guest array to the calendar query.
 */
function respondWith(body: unknown, status = 200): void {
  fetchImpl.mockImplementation((url: string) => {
    const isGuests = String(url).includes('/guests');
    const payload = isGuests ? body : [];

    return new Response(JSON.stringify(payload), {
      status: isGuests ? status : 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  // Retries off so the error path resolves immediately in tests.
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

function renderList() {
  return render(<GuestList />, { wrapper: Wrapper });
}

describe('GuestList', () => {
  beforeEach(() => {
    fetchImpl.mockReset();
  });

  it('announces loading to assistive technology', async () => {
    fetchImpl.mockImplementation(() => new Promise(() => {}));
    renderList();

    expect(await screen.findByText('Loading guests…')).toBeInTheDocument();
  });

  it('renders guests once loaded', async () => {
    respondWith([guest(), guest({ id: 'g2', full_name: 'Ayesha K.' })]);

    renderList();

    expect(await screen.findByText('Sana R.')).toBeInTheDocument();
    expect(screen.getByText('Ayesha K.')).toBeInTheDocument();
  });

  it('announces the result count', async () => {
    respondWith([guest()]);

    renderList();

    // Singular, so it does not read "1 guests".
    expect(await screen.findAllByText('1 guest')).not.toHaveLength(0);
  });

  it('shows a warm empty state before any guests exist', async () => {
    respondWith([]);

    renderList();

    expect(await screen.findByText('no guests yet')).toBeInTheDocument();
    // The PRD forbids a blank list; it must suggest the next step.
    expect(screen.getByText(/a name is enough to start/)).toBeInTheDocument();
  });

  it('distinguishes an empty search from an empty roster', async () => {
    respondWith([]);

    renderList();
    await screen.findByText('no guests yet');

    await userEvent.type(screen.getByLabelText('Search guests'), 'zzz');

    expect(await screen.findByText('no one by that name')).toBeInTheDocument();
  });

  it('explains how the regulars badge is earned when there are none', async () => {
    respondWith([]);

    renderList();
    await screen.findByText('no guests yet');

    await userEvent.click(screen.getByRole('button', { name: /regulars/ }));

    expect(await screen.findByText('no regulars just yet')).toBeInTheDocument();
  });

  it('surfaces the API message on failure and offers a retry', async () => {
    respondWith({ code: 'rate_limited', message: "That's a lot of requests." }, 429);

    renderList();

    const alert = await screen.findByRole('alert');
    // The API's copy, not a generic failure string.
    expect(alert).toHaveTextContent("That's a lot of requests.");
    expect(screen.getByRole('button', { name: 'try again' })).toBeInTheDocument();
  });

  it('sends the search term to the API', async () => {
    respondWith([]);

    renderList();
    await screen.findByText('no guests yet');

    await userEvent.type(screen.getByLabelText('Search guests'), 'sana');

    await waitFor(() => {
      const urls = fetchImpl.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes('search=sana'))).toBe(true);
    });
  });

  it('sends the regulars filter to the API', async () => {
    respondWith([]);

    renderList();
    await screen.findByText('no guests yet');

    await userEvent.click(screen.getByRole('button', { name: /regulars/ }));

    await waitFor(() => {
      const urls = fetchImpl.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes('regulars_only=true'))).toBe(true);
    });
  });

  it('marks the active filter with aria-pressed', async () => {
    respondWith([]);

    renderList();
    await screen.findByText('no guests yet');

    expect(screen.getByRole('button', { name: 'everyone' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: /regulars/ }));

    expect(screen.getByRole('button', { name: /regulars/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('gives every control a 44px touch target', async () => {
    respondWith([]);

    renderList();
    await screen.findByText('no guests yet');

    expect(screen.getByLabelText('Search guests')).toHaveClass('min-h-[44px]');

    for (const name of ['everyone', /regulars/, '+ add a guest']) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-h-[44px]');
    }
  });
});
