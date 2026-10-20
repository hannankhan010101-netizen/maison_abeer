import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarView } from './CalendarView';

// The calendar navigates to a class rather than opening an editor in place,
// so it needs the app router, which this render tree does not mount.
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/calendar',
}));
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

const CLASS_TYPES = [
  {
    id: 'ct-1',
    name: 'Bento cake',
    color_token: 'pink',
    default_seats: 10,
    default_duration_minutes: 150,
  },
];

function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Answers both reads the calendar makes.
 *
 * The catalogue is its own request now — quick-add must be able to offer a
 * class type on a week with no sessions at all — so the stub has to route by
 * path rather than return one body to everything.
 */
function respondWith(sessions: Session[]): void {
  fetchImpl.mockImplementation((input: unknown) => {
    const path = new URL(String(input)).pathname;

    return reply(path === '/api/v1/class-types' ? CLASS_TYPES : sessions);
  });
}

/** The session-window request, whichever order the two reads went out in. */
function sessionWindowUrl(): URL {
  const call = fetchImpl.mock.calls.find(
    (args) => new URL(String(args[0])).pathname === '/api/v1/sessions',
  );

  if (!call) throw new Error('The calendar never asked for its session window.');

  return new URL(String(call[0]));
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

    await screen.findAllByText(/Nothing scheduled/);

    const url = sessionWindowUrl();
    expect(new Date(url.searchParams.get('start')!).getDate()).toBe(3);
    expect(new Date(url.searchParams.get('end')!).getDate()).toBe(9);
  });

  it('renders the same session in both layouts', async () => {
    respondWith([session()]);
    renderCalendar();

    // One agenda row and one grid cell, from a single dataset.
    const chips = await screen.findAllByRole('button', { name: /Bento cake/ });
    expect(chips).toHaveLength(2);
  });

  it('gives a session a spoken label rather than reading "8/10"', async () => {
    respondWith([session()]);
    renderCalendar();

    const [chip] = await screen.findAllByRole('button', { name: /Bento cake/ });
    expect(chip).toHaveAccessibleName(/8 of 10 seats booked/);
  });

  it('says a locked class is closed to new bookings', async () => {
    respondWith([session({ status: 'locked' })]);
    renderCalendar();

    const [chip] = await screen.findAllByRole('button', { name: /Bento cake/ });
    expect(chip).toHaveAccessibleName(/closed to new bookings/);
  });

  it('marks empty days rather than leaving a blank column', async () => {
    respondWith([]);
    renderCalendar();

    // Seven agenda days, all empty — and each offers to add a class.
    expect(await screen.findAllByText(/Nothing scheduled/)).toHaveLength(7);
  });

  it('labels today', async () => {
    respondWith([]);
    renderCalendar();

    expect(await screen.findByText(/Tue 4 · today/)).toBeInTheDocument();
  });

  it('moves to the next week and refetches', async () => {
    respondWith([]);
    renderCalendar();
    await screen.findAllByText(/Nothing scheduled/);

    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));

    const last = new URL(String(fetchImpl.mock.calls.at(-1)![0]));
    // Week of Mon 10th.
    expect(new Date(last.searchParams.get('start')!).getDate()).toBe(10);
  });

  it('moves to the previous week', async () => {
    respondWith([]);
    renderCalendar();
    await screen.findAllByText(/Nothing scheduled/);

    await userEvent.click(screen.getByRole('button', { name: '← previous' }));

    const last = new URL(String(fetchImpl.mock.calls.at(-1)![0]));
    expect(new Date(last.searchParams.get('start')!).getDate()).toBe(27);
  });

  it('returns to the current week', async () => {
    respondWith([]);
    renderCalendar();
    await screen.findAllByText(/Nothing scheduled/);

    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await userEvent.click(screen.getByRole('button', { name: 'This week' }));

    const last = new URL(String(fetchImpl.mock.calls.at(-1)![0]));
    expect(new Date(last.searchParams.get('start')!).getDate()).toBe(3);
  });

  /**
   * The week changes; something has to say so.
   *
   * The prev/next buttons always changed seven columns of content silently,
   * and the swipe added a second silent route to the same change. Nothing
   * navigates, nothing takes focus, and the `h1` above reads "This week"
   * whichever week is showing, so a screen-reader user had no confirmation at
   * all. These assert the preconditions for an announcement, not the speech —
   * see ADR 0004.
   */
  describe('the week announcement', () => {
    it('says nothing about the week it loaded on', async () => {
      respondWith([]);
      renderCalendar();
      await screen.findAllByText(/Nothing scheduled/);

      // Arriving on this week is not a change the host made. Reading it out
      // would announce the result of opening the page.
      expect(screen.getByTestId('announcer').textContent).toBe('');
    });

    it('names the new week on the same node', async () => {
      respondWith([]);
      renderCalendar();
      await screen.findAllByText(/Nothing scheduled/);

      // Captured *before* the click: a region that is unmounted and inserted
      // again with the new text announces nothing, and `getByTestId` after
      // the fact would happily resolve the replacement.
      const region = screen.getByTestId('announcer');

      await userEvent.click(screen.getByRole('button', { name: 'Next →' }));

      // The month's position is Intl's business and the runner has no locale
      // to pin here (`formatWeekLabel` is asserted against explicit locales in
      // dates.test.ts). Mon 10 Aug is the week after NOW either way.
      expect(region.textContent).toMatch(/^Week of /);
      expect(region.textContent).toContain('10');
      expect(screen.getByTestId('announcer')).toBe(region);
      expect(region.isConnected).toBe(true);
    });

    it('speaks again on the way back', async () => {
      respondWith([]);
      renderCalendar();
      await screen.findAllByText(/Nothing scheduled/);

      const region = screen.getByTestId('announcer');

      // "This week" is only a change once the host has left it — from the
      // anchor it loaded on the label is identical, and silence there is
      // correct.
      await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
      await userEvent.click(screen.getByRole('button', { name: 'This week' }));

      expect(region.textContent).toMatch(/^Week of /);
      expect(region.textContent).toContain('3');
      expect(region.isConnected).toBe(true);
    });
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
    await screen.findAllByText(/Nothing scheduled/);

    /*
     * A control clears the floor either by declaring a min-height or by being
     * a fixed square at least that big. Asserting the literal `min-h-[44px]`
     * would reject a 56px square for not saying 44 — the square arm is
     * forward-looking, though: every control this tree renders today clears the
     * floor through `min-h-[44px]`, and the `size-14` one (`ui/Fab`) is a
     * sibling of the calendar, not part of it.
     *
     * `min-h-[var(--tap-min)]` is the more correct spelling of the same floor —
     * `--tap-min: 44px` in `styles/tokens.css`, asserted at >= 44 by
     * `styles/tokens.test.ts` — so it counts even though nothing emits it yet.
     */
    for (const button of screen.getAllByRole('button')) {
      const classes = button.className;
      /*
       * Deliberately variant-blind: `\b` used to match after the `:` in a
       * variant, so `sm:size-11` satisfied a check that exists only to speak
       * about phone width. Only an unprefixed `size-*` says anything about
       * 375px.
       */
      const square = classes.match(/(?:^|\s)size-(\d+)(?=\s|$)/);

      const clears =
        classes.includes('min-h-[44px]') ||
        classes.includes('min-h-[var(--tap-min)]') ||
        (square ? Number(square[1]) * 4 >= 44 : false);

      expect(clears, `undersized control: ${classes.slice(0, 80)}`).toBe(true);
    }
  });

  /*
   * The week swipe, which nothing dispatched a pointer event at before.
   *
   * jsdom implements no `PointerEvent`, so these are `MouseEvent`s typed as
   * pointer events with the two fields the handler reads bolted on. React
   * dispatches by event *name*, and its synthetic event copies `pointerId` and
   * `pointerType` straight off the native one, so the handler sees exactly what
   * a browser would hand it.
   */
  describe('the week swipe', () => {
    function pointer(
      type: 'pointerdown' | 'pointerup' | 'pointercancel',
      { id, x, y = 100 }: { id: number; x: number; y?: number },
    ) {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      });
      Object.assign(event, { pointerId: id, pointerType: 'touch' });
      return event;
    }

    async function agenda() {
      respondWith([]);
      const { container } = renderCalendar();
      await screen.findAllByText(/Nothing scheduled/);

      // The phone layout's list — the only element the gesture is wired to.
      return container.querySelector('ol')!;
    }

    it('ignores a second finger resting on the list', async () => {
      const list = await agenda();

      /*
       * One-handed: the base of the thumb lands on the left edge of the list
       * while the index finger taps a chip on the right. With one shared start
       * point the finger that lifted first was diffed against the other's
       * origin — dx 310, dy 0, both guards passed — so tapping a single class
       * rewound the week while `onSelect` navigated.
       */
      fireEvent(list, pointer('pointerdown', { id: 2, x: 330 }));
      fireEvent(list, pointer('pointerdown', { id: 1, x: 20 }));
      fireEvent(list, pointer('pointerup', { id: 2, x: 330 }));

      expect(screen.getByText(/Tue 4 · today/)).toBeInTheDocument();
    });

    it('still swipes after the browser cancels a scroll', async () => {
      const list = await agenda();

      // A vertical scroll: Chrome claims the touch and ends it with
      // `pointercancel`, never `pointerup`. The start point has to go with it,
      // or the "already tracking" guard latches and no swipe starts again.
      fireEvent(list, pointer('pointerdown', { id: 1, x: 300 }));
      fireEvent(list, pointer('pointercancel', { id: 1, x: 300, y: 300 }));
      expect(screen.getByText(/Tue 4 · today/)).toBeInTheDocument();

      // And a decisive drag with the ~30px of drift a thumb arc produces still
      // changes the week.
      fireEvent(list, pointer('pointerdown', { id: 1, x: 300, y: 100 }));
      fireEvent(list, pointer('pointerup', { id: 1, x: 200, y: 130 }));

      // Both layouts render from the one dataset, so the new week's days appear
      // twice — in the agenda and in the grid's column headers.
      expect(await screen.findAllByText(/Tue 11/)).not.toHaveLength(0);
      expect(screen.queryByText(/Tue 4 · today/)).not.toBeInTheDocument();
    });

    it('announces the week it landed on', async () => {
      const list = await agenda();
      // Before the gesture, so a region replaced rather than updated fails.
      const region = screen.getByTestId('announcer');

      fireEvent(list, pointer('pointerdown', { id: 1, x: 300 }));
      fireEvent(list, pointer('pointerup', { id: 1, x: 200, y: 130 }));

      // One region serves both routes into a week, because both go through
      // `setAnchor` — and the gesture is the half with nothing to re-read
      // afterwards. Mon 10 Aug is the week after NOW.
      expect(await screen.findAllByText(/Tue 11/)).not.toHaveLength(0);
      expect(region.textContent).toMatch(/^Week of /);
      expect(region.textContent).toContain('10');
      expect(screen.getByTestId('announcer')).toBe(region);
    });
  });

  it('opens the class rather than jumping into a seat editor', async () => {
    push.mockClear();
    respondWith([session()]);

    render(<CalendarView now={NOW} />, { wrapper: Wrapper });

    await userEvent.click((await screen.findAllByRole('button', { name: /Bento cake/ }))[0]!);

    // Tapping a class should show the class. The seat editor lives on that
    // page, one tap away, rather than ambushing the host here.
    expect(push).toHaveBeenCalledWith('/sessions/session-1');
  });
});
