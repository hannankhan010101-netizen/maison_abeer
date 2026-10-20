import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GuestList, describeResult } from './GuestList';
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

/**
 * Two different answers, so a filter tap actually changes the result.
 *
 * `respondWith` returns one body to every guest query, which is fine for the
 * states it was written for and useless for an announcement: the count has to
 * *change* for there to be anything to announce.
 */
function respondByFilter(all: Guest[], regulars: Guest[]): void {
  fetchImpl.mockImplementation((url: string) => {
    const target = new URL(String(url));

    if (!target.pathname.includes('/guests')) {
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }

    const body = target.searchParams.get('regulars_only') === 'true' ? regulars : all;

    return new Response(JSON.stringify(body), {
      status: 200,
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

  it('shows the result count', async () => {
    respondWith([guest()]);

    renderList();

    // Singular, so it does not read "1 guests". This is the visible `Chip`;
    // the spoken count is the live region below, which this assertion cannot
    // see — `findAllByText` was satisfied by the chip alone the whole time
    // the `sr-only` copy next to it was announcing nothing.
    expect(await screen.findByText('1 guest')).toBeInTheDocument();
  });

  /**
   * What the filters and the search just did.
   *
   * The screen already had an `sr-only` "N guests" paragraph, and it was
   * silent: it lived inside the branch that renders the list, so every filter
   * tap re-entered `isPending` (`useGuests` keys on `{search, regularsOnly}`
   * with no placeholder data), removed the paragraph with the old list, and
   * inserted a *new* one holding the new count. AT announces changes to a
   * region it is already watching; it does not read a region that arrives
   * with its text. Hence a node captured before every interaction here.
   */
  describe('the result announcement', () => {
    it('does not read the list out on arrival', async () => {
      respondWith([guest(), guest({ id: 'g2', full_name: 'Ayesha K.' })]);

      renderList();
      await screen.findByText('Sana R.');

      // Opening the page is not a state the host changed. Announcing here
      // would read the whole result back at them for navigating to /guests.
      expect(screen.getByTestId('announcer').textContent).toBe('');
    });

    it('names the new count on the same node when a filter changes', async () => {
      respondByFilter(
        [guest(), guest({ id: 'g2', full_name: 'Ayesha K.', is_regular: false })],
        [guest()],
      );

      renderList();
      await screen.findByText('Ayesha K.');

      const region = screen.getByTestId('announcer');

      await userEvent.click(screen.getByRole('button', { name: /Regulars/ }));

      // Which list, not just the number: the tap changes the count and
      // nothing else on screen, so "1 guest" alone would not say what it did.
      await waitFor(() => expect(region.textContent).toBe('1 guest, regulars'));

      // The guarantee. React removed the old list subtree from the document
      // on the key change; if the region had gone with it, this is the only
      // assertion that would notice.
      expect(screen.getByTestId('announcer')).toBe(region);
      expect(region.isConnected).toBe(true);
    });

    it('speaks the empty state it shows', async () => {
      respondWith([]);

      renderList();
      await screen.findByText('No guests yet');

      const region = screen.getByTestId('announcer');

      await userEvent.type(screen.getByLabelText('Search guests'), 'zzz');

      // The same `describeResult` the visible empty is rendered from, so the
      // two cannot drift — and a different sentence from the one it loaded
      // with ("No guests yet"), so it is a change and gets announced.
      await waitFor(() => expect(region.textContent).toBe('No one by that name'));
      expect(screen.getByTestId('announcer')).toBe(region);
    });
  });

  describe('describeResult', () => {
    it('counts in the singular', () => {
      expect(describeResult({ count: 1, searching: false, regularsOnly: false }).spoken).toBe(
        '1 guest',
      );
    });

    it('counts in the plural', () => {
      expect(describeResult({ count: 12, searching: false, regularsOnly: false }).spoken).toBe(
        '12 guests',
      );
    });

    it('says which list the count is of', () => {
      expect(describeResult({ count: 2, searching: false, regularsOnly: true }).spoken).toBe(
        '2 guests, regulars',
      );
    });

    it('speaks the same three empties it renders', () => {
      // Three empties, because an empty roster, an empty search and no
      // regulars yet mean three different things — and the spoken copy is the
      // one nobody can see go stale.
      const searched = describeResult({ count: 0, searching: true, regularsOnly: false });
      const regulars = describeResult({ count: 0, searching: false, regularsOnly: true });
      const fresh = describeResult({ count: 0, searching: false, regularsOnly: false });

      expect(searched.spoken).toBe('No one by that name');
      expect(searched.spoken).toBe(searched.empty?.title);
      expect(regulars.spoken).toBe('No regulars just yet');
      expect(regulars.spoken).toBe(regulars.empty?.title);
      expect(fresh.spoken).toBe('No guests yet');
      expect(fresh.spoken).toBe(fresh.empty?.title);
    });

    it('does not fold the search term into the count', () => {
      // One sentence per *result*, not per keystroke. The cost is the
      // residual silence in ADR 0004: two terms with the same count say
      // nothing the second time.
      expect(describeResult({ count: 3, searching: true, regularsOnly: false }).spoken).toBe(
        '3 guests',
      );
    });
  });

  it('shows a warm empty state before any guests exist', async () => {
    respondWith([]);

    renderList();

    expect(await screen.findByText('No guests yet')).toBeInTheDocument();
    // The PRD forbids a blank list; it must suggest the next step.
    expect(screen.getByText(/a name is enough to start/)).toBeInTheDocument();
  });

  it('distinguishes an empty search from an empty roster', async () => {
    respondWith([]);

    renderList();
    await screen.findByText('No guests yet');

    await userEvent.type(screen.getByLabelText('Search guests'), 'zzz');

    // The title is deliberately in two places now — the empty state the host
    // reads and the live region that speaks it (ADR 0004) — so the note is
    // what identifies the *visible* one. Both copies are asserted rather than
    // the query loosened, because one of them going missing is a real defect.
    expect(await screen.findByText('Try a shorter search?')).toBeInTheDocument();
    expect(screen.getAllByText('No one by that name')).toHaveLength(2);
  });

  it('explains how the regulars badge is earned when there are none', async () => {
    respondWith([]);

    renderList();
    await screen.findByText('No guests yet');

    await userEvent.click(screen.getByRole('button', { name: /Regulars/ }));

    // As above: the note is unique to the visible empty, the title is spoken
    // as well as shown.
    expect(await screen.findByText(/They earn the badge/)).toBeInTheDocument();
    expect(screen.getAllByText('No regulars just yet')).toHaveLength(2);
  });

  it('surfaces the API message on failure and offers a retry', async () => {
    respondWith({ code: 'rate_limited', message: "That's a lot of requests." }, 429);

    renderList();

    const alert = await screen.findByRole('alert');
    // The API's copy, not a generic failure string.
    expect(alert).toHaveTextContent("That's a lot of requests.");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('sends the search term to the API', async () => {
    respondWith([]);

    renderList();
    await screen.findByText('No guests yet');

    await userEvent.type(screen.getByLabelText('Search guests'), 'sana');

    await waitFor(() => {
      const urls = fetchImpl.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes('search=sana'))).toBe(true);
    });
  });

  it('sends the regulars filter to the API', async () => {
    respondWith([]);

    renderList();
    await screen.findByText('No guests yet');

    await userEvent.click(screen.getByRole('button', { name: /Regulars/ }));

    await waitFor(() => {
      const urls = fetchImpl.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes('regulars_only=true'))).toBe(true);
    });
  });

  it('marks the active filter with aria-pressed', async () => {
    respondWith([]);

    renderList();
    await screen.findByText('No guests yet');

    expect(screen.getByRole('button', { name: 'Everyone' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: /Regulars/ }));

    expect(screen.getByRole('button', { name: /Regulars/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('gives every control a 44px touch target', async () => {
    respondWith([]);

    renderList();
    await screen.findByText('No guests yet');

    expect(screen.getByLabelText('Search guests')).toHaveClass('min-h-[44px]');

    for (const name of ['Everyone', /Regulars/, '+ Add a guest']) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-h-[44px]');
    }
  });
});
