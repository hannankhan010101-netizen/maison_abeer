import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Dashboard, buildAlerts } from './Dashboard';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';
import type { ScheduledMessage, Session, UpcomingBirthday } from '@/lib/api/types';

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

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const NOW = new Date(2026, 7, 4, 10, 0);

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    class_type_id: 'ct-1',
    class_type_name: 'Bento cake decorating',
    color_token: 'pink',
    title: null,
    location: 'Studio A',
    notes: null,
    starts_at: new Date(2026, 7, 4, 14, 0).toISOString(),
    ends_at: new Date(2026, 7, 4, 16, 30).toISOString(),
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

/** Routes each dashboard query to its own payload.

 * Matched on the URL rather than call order: the queries fire concurrently,
 * so a positional mock would hand the sessions payload to whichever landed
 * first and the failure would look like a component bug.
 */
function respond({
  sessions = [],
  birthdays = [],
  failed = [],
}: {
  sessions?: Session[];
  birthdays?: UpcomingBirthday[];
  failed?: ScheduledMessage[];
}) {
  fetchImpl.mockImplementation((url: string) => {
    const path = String(url);

    let body: unknown = sessions;
    if (path.includes('/birthdays')) body = birthdays;
    else if (path.includes('/messages/failed')) body = failed;

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

function renderDashboard(props = {}) {
  return render(<Dashboard now={NOW} {...props} />, { wrapper: Wrapper });
}

function failedMessage(overrides: Partial<ScheduledMessage> = {}): ScheduledMessage {
  return {
    id: 'msg-1',
    session_id: 'session-1',
    guest_id: 'guest-1',
    kind: 'guest_reminder',
    channel: 'whatsapp',
    status: 'failed',
    send_at: NOW.toISOString(),
    sent_at: null,
    body: 'See you tomorrow!',
    attempt_count: 1,
    last_error: 'Number unreachable',
    ...overrides,
  };
}

describe('buildAlerts', () => {
  it('is quiet when nothing needs attention', () => {
    expect(buildAlerts([session()], [])).toEqual([]);
  });

  // The PRD forbids a silent failure (§3.2). These are the guard.

  it('raises a failed send as critical', () => {
    const alerts = buildAlerts([session()], [], [failedMessage()]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.tone).toBe('critical');
    expect(alerts[0]!.title).toBe("1 message didn't send");
  });

  it('shows the provider reason when there is exactly one', () => {
    const alerts = buildAlerts([session()], [], [failedMessage()]);
    expect(alerts[0]!.description).toBe('Number unreachable');
  });

  it('offers an in-place retry for a single failure', () => {
    const alerts = buildAlerts([session()], [], [failedMessage({ id: 'msg-42' })]);

    expect(alerts[0]!.retryMessageId).toBe('msg-42');
    // Nothing to navigate to — the fix happens on the dashboard.
    expect(alerts[0]!.href).toBeUndefined();
  });

  it('sends the host to the messages screen when several failed', () => {
    const alerts = buildAlerts(
      [session()],
      [],
      [failedMessage({ id: 'a' }), failedMessage({ id: 'b' })],
    );

    expect(alerts[0]!.title).toBe("2 messages didn't send");
    expect(alerts[0]!.href).toBe('/messages');
    // Retrying one of several in place would leave the rest silently failed.
    expect(alerts[0]!.retryMessageId).toBeUndefined();
  });

  it('puts a failed send above every other alert', () => {
    const alerts = buildAlerts(
      [session({ unassigned_guest_count: 2, roster_changed_since_export: true })],
      [],
      [failedMessage()],
    );

    expect(alerts[0]!.id).toBe('messages-failed');
  });

  it('flags guests without a table', () => {
    const alerts = buildAlerts([session({ unassigned_guest_count: 2 })], []);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.title).toBe('2 guests need a table');
    expect(alerts[0]!.href).toBe('/guests');
  });

  it('uses the singular for one guest', () => {
    const alerts = buildAlerts([session({ unassigned_guest_count: 1 })], []);
    expect(alerts[0]!.title).toBe('1 guest needs a table');
  });

  it('raises a critical alert when the roster drifted from the export', () => {
    const alerts = buildAlerts([session({ roster_changed_since_export: true })], []);

    // The printed tags no longer match who is coming.
    expect(alerts[0]!.tone).toBe('critical');
    expect(alerts[0]!.href).toBe('/tags');
  });

  it('sorts critical alerts above gentler ones', () => {
    const alerts = buildAlerts(
      [session({ unassigned_guest_count: 1, roster_changed_since_export: true })],
      [],
    );

    expect(alerts.map((a) => a.tone)).toEqual(['critical', 'warning']);
  });

  it('nudges about a freed seat only when one is actually free', () => {
    const freed = session({
      capacity: { ...session().capacity, waitlist_is_open: true, available: 1 },
    });
    const full = session({
      capacity: { ...session().capacity, waitlist_is_open: true, available: 0 },
    });

    expect(buildAlerts([freed], [])).toHaveLength(1);
    expect(buildAlerts([full], [])).toHaveLength(0);
  });

  it('only mentions a birthday for a guest already booked in', () => {
    const booked: UpcomingBirthday = {
      guest_id: 'g1',
      full_name: 'Ayesha K.',
      birthday: '1995-08-08',
      days_away: 4,
      has_upcoming_booking: true,
    };

    expect(buildAlerts([], [booked])).toHaveLength(1);
    expect(buildAlerts([], [{ ...booked, has_upcoming_booking: false }])).toHaveLength(0);
  });

  it('ignores a birthday too far out to act on', () => {
    const distant: UpcomingBirthday = {
      guest_id: 'g1',
      full_name: 'Ayesha K.',
      birthday: '1995-09-01',
      days_away: 28,
      has_upcoming_booking: true,
    };

    expect(buildAlerts([], [distant])).toHaveLength(0);
  });

  it('gives every alert a destination', () => {
    const alerts = buildAlerts(
      [session({ unassigned_guest_count: 1, roster_changed_since_export: true })],
      [],
    );

    // An alert with nothing to do about it is noise (PRD §2.1).
    for (const alert of alerts) {
      expect(alert.href).toMatch(/^\//);
    }
  });
});

describe('Dashboard', () => {
  beforeEach(() => {
    fetchImpl.mockReset();
  });

  it('greets by time of day', async () => {
    respond({ sessions: [session()] });
    renderDashboard({ hostName: 'zara' });

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Good morning');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('zara');
  });

  it('shows the next class with its capacity ring', async () => {
    respond({ sessions: [session()] });
    renderDashboard();

    expect(await screen.findByText('Bento cake decorating')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '8 of 10 seats booked' })).toBeInTheDocument();
  });

  it('picks the soonest class when several are upcoming', async () => {
    respond({
      sessions: [
        session({
          id: 'later',
          class_type_name: 'Pottery',
          starts_at: new Date(2026, 7, 9).toISOString(),
        }),
        session({ id: 'sooner', class_type_name: 'Ceramic painting' }),
      ],
    });

    renderDashboard();

    expect(await screen.findByText('Ceramic painting')).toBeInTheDocument();
  });

  it('offers the three quick actions as real links', async () => {
    respond({ sessions: [session()] });
    renderDashboard();

    // Links, not buttons: middle-click and open-in-new-tab must work.
    expect(await screen.findByRole('link', { name: 'Print name tags' })).toHaveAttribute(
      'href',
      '/tags',
    );
    expect(screen.getByRole('link', { name: 'View guest list' })).toHaveAttribute(
      'href',
      '/guests',
    );
    expect(screen.getByRole('link', { name: 'Adjust seats' })).toHaveAttribute('href', '/calendar');
  });

  it('shows a warm empty state with nothing scheduled', async () => {
    respond({ sessions: [] });
    renderDashboard();

    expect(await screen.findByText('Nothing scheduled yet')).toBeInTheDocument();
    expect(screen.getByText('Plan something lovely?')).toBeInTheDocument();
  });

  it('adapts the greeting to a quiet day', async () => {
    respond({ sessions: [] });
    renderDashboard();

    expect(await screen.findByText(/Quiet day today/)).toBeInTheDocument();
  });

  it('announces a critical alert', async () => {
    respond({ sessions: [session({ roster_changed_since_export: true })] });
    renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Roster changed since your last export');
  });

  it('says so when nothing needs the host', async () => {
    respond({ sessions: [session()] });
    renderDashboard();

    expect(await screen.findByText(/nothing needs you right now/)).toBeInTheDocument();
  });

  it('surfaces the API message on failure', async () => {
    fetchImpl.mockImplementation(
      () =>
        new Response(JSON.stringify({ code: 'rate_limited', message: 'Give it a moment.' }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    );

    renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Give it a moment.')).toBeInTheDocument();
  });

  it('surfaces a failed send on the dashboard itself', async () => {
    respond({ sessions: [session()], failed: [failedMessage()] });

    renderDashboard();

    expect(await screen.findByText("1 message didn't send")).toBeInTheDocument();
  });

  it('retries a failed send without leaving the page', async () => {
    respond({ sessions: [session()], failed: [failedMessage({ id: 'msg-42' })] });

    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    const retried = fetchImpl.mock.calls.find((call) =>
      String(call[0]).includes('/messages/msg-42/retry'),
    );
    expect(retried).toBeDefined();
    expect((retried?.[1] as RequestInit).method).toBe('POST');
  });
});
