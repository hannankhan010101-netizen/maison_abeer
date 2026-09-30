import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewSessionModal, durationOptions, formatDuration } from './NewSessionModal';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';
import { ToastProvider } from '@/components/ui/Toast';
import type { ClassType } from '@/lib/api/types';

/**
 * Quick-add.
 *
 * The regression this file exists for: the class-type dropdown used to be
 * built from the sessions the calendar had already loaded, so on a week with
 * no classes it had no options and the host could not schedule anything.
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

const POTTERY: ClassType = {
  id: 'ct-pottery',
  name: 'Pottery & wheel throwing',
  color_token: 'terra',
  default_seats: 8,
  default_duration_minutes: 180,
};

const BENTO: ClassType = {
  id: 'ct-bento',
  name: 'Bento cake decorating',
  color_token: 'pink',
  default_seats: 12,
  default_duration_minutes: 150,
};

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The catalogue read, plus a create that echoes one session back. */
function respondWith(classTypes: ClassType[]): void {
  fetchImpl.mockImplementation((input: unknown, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const method = (init?.method ?? 'GET').toUpperCase();

    if (path === '/api/v1/class-types') return reply(classTypes);

    if (path === '/api/v1/sessions' && method === 'POST') {
      return reply({ sessions: [{ id: 'new' }], energy: { warning: 'none', message: '' } }, 201);
    }

    return reply([]);
  });
}

function createdBody(): Record<string, unknown> {
  const call = fetchImpl.mock.calls.find(
    (args) => new URL(String(args[0])).pathname === '/api/v1/sessions',
  );

  if (!call) throw new Error('Nothing was ever posted to /sessions.');

  return JSON.parse(String((call[1] as RequestInit).body));
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

const FRIDAY = new Date(2026, 7, 7, 0, 0);

function renderModal(props: Partial<React.ComponentProps<typeof NewSessionModal>> = {}) {
  return render(<NewSessionModal open onClose={() => {}} defaultDate={FRIDAY} {...props} />, {
    wrapper: Wrapper,
  });
}

describe('NewSessionModal', () => {
  beforeEach(() => {
    fetchImpl.mockReset();
  });

  it('offers the studio catalogue even with no sessions loaded', async () => {
    respondWith([BENTO, POTTERY]);
    renderModal();

    const select = await screen.findByLabelText('Class type');
    const names = [...select.querySelectorAll('option')].map((option) => option.textContent);

    expect(names).toEqual(['Bento cake decorating', 'Pottery & wheel throwing']);
  });

  it('starts with a real class type selected, not a blank', async () => {
    respondWith([BENTO, POTTERY]);
    renderModal();

    const select = (await screen.findByLabelText('Class type')) as HTMLSelectElement;

    expect(select.value).toBe('ct-bento');
  });

  it('says so plainly when the studio has no class types yet', async () => {
    respondWith([]);
    renderModal();

    expect(await screen.findByText(/No class types yet/)).toBeInTheDocument();
    // Better an explanation than a dropdown that silently offers nothing.
    expect(screen.queryByLabelText('Class type')).not.toBeInTheDocument();
  });

  it('reports a catalogue that failed to load', async () => {
    fetchImpl.mockImplementation(() => reply({ code: 'server_error', message: 'nope' }, 500));
    renderModal();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load your class types/);
  });

  it('prefills the date from the day that was tapped', async () => {
    respondWith([BENTO]);
    renderModal();

    const input = (await screen.findByLabelText('Date & time')) as HTMLInputElement;

    expect(input.value.startsWith('2026-08-07')).toBe(true);
  });

  it('re-prefills when a different day is tapped', async () => {
    respondWith([BENTO]);
    const view = renderModal();

    await screen.findByLabelText('Date & time');

    view.rerender(
      <Wrapper>
        <NewSessionModal open onClose={() => {}} defaultDate={new Date(2026, 7, 9, 0, 0)} />
      </Wrapper>,
    );

    await waitFor(() => {
      const input = screen.getByLabelText('Date & time') as HTMLInputElement;
      expect(input.value.startsWith('2026-08-09')).toBe(true);
    });
  });

  it('brings the class type defaults with it', async () => {
    respondWith([BENTO, POTTERY]);
    renderModal();

    const seats = (await screen.findByLabelText('Seats')) as HTMLInputElement;
    expect(seats.value).toBe('12');

    await userEvent.selectOptions(screen.getByLabelText('Class type'), 'ct-pottery');

    // Pottery runs eight seats for three hours; the host should not have to
    // correct two fields to say so.
    expect((screen.getByLabelText('Seats') as HTMLInputElement).value).toBe('8');
    expect((screen.getByLabelText('How long') as HTMLSelectElement).value).toBe('180');
  });

  it('submits the selected class type and a matching end time', async () => {
    respondWith([BENTO, POTTERY]);
    renderModal();

    await screen.findByLabelText('Class type');
    await userEvent.selectOptions(screen.getByLabelText('Class type'), 'ct-pottery');
    await userEvent.click(screen.getByRole('button', { name: 'Add session' }));

    await waitFor(() => expect(createdBody().class_type_id).toBe('ct-pottery'));

    const body = createdBody();
    const minutes =
      (new Date(String(body.ends_at)).getTime() - new Date(String(body.starts_at)).getTime()) /
      60_000;

    expect(minutes).toBe(180);
    expect(body.seats).toBe(8);
    expect(body.repeat_weekly_until).toBeNull();
  });

  it('renders nothing while closed', () => {
    respondWith([BENTO]);
    render(<NewSessionModal open={false} onClose={() => {}} />, { wrapper: Wrapper });

    expect(screen.queryByText('New session ✨')).not.toBeInTheDocument();
  });
});

describe('durationOptions', () => {
  it('keeps the class type default even when it is off the usual list', () => {
    expect(durationOptions(100)).toEqual([90, 100, 120, 150, 180, 240]);
  });

  it('does not duplicate a default that is already offered', () => {
    expect(durationOptions(150)).toEqual([90, 120, 150, 180, 240]);
  });
});

describe('formatDuration', () => {
  it('reads naturally', () => {
    expect(formatDuration(60)).toBe('1 hour');
    expect(formatDuration(180)).toBe('3 hours');
    expect(formatDuration(150)).toBe('2.5 hours');
    expect(formatDuration(100)).toBe('100 minutes');
  });
});
