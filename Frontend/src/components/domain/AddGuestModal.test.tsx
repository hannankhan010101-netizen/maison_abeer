import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddGuestModal } from './AddGuestModal';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';
import { ToastProvider } from '@/components/ui/Toast';

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

function respond(status: number, body: unknown) {
  fetchImpl.mockImplementation(
    () =>
      new Response(JSON.stringify(body), {
        status,
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

function renderModal(props: Partial<React.ComponentProps<typeof AddGuestModal>> = {}) {
  return render(<AddGuestModal open onClose={() => {}} {...props} />, { wrapper: Wrapper });
}

function lastBody(): Record<string, unknown> {
  const post = fetchImpl.mock.calls.find((c) => (c[1] as RequestInit).method === 'POST');
  return JSON.parse(String((post![1] as RequestInit).body));
}

describe('AddGuestModal', () => {
  beforeEach(() => fetchImpl.mockReset());

  it('accepts a name on its own', async () => {
    respond(201, { id: 'g1', full_name: 'Hira S.' });
    renderModal();

    await userEvent.type(screen.getByLabelText('Name'), 'Hira S.');
    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    // Hosts add people from DMs and calls; requiring contact details would
    // push them back to the notes app this replaces.
    await waitFor(() => expect(lastBody().full_name).toBe('Hira S.'));
    expect(lastBody().phone).toBeNull();
  });

  it('sends the details that were filled in', async () => {
    respond(201, { id: 'g1', full_name: 'Sana R.' });
    renderModal();

    await userEvent.type(screen.getByLabelText('Name'), 'Sana R.');
    await userEvent.type(screen.getByLabelText('Phone'), '0300 1234567');
    await userEvent.type(screen.getByLabelText('A note to remember them by'), 'loves matcha');
    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    await waitFor(() => {
      const body = lastBody();
      expect(body.phone).toBe('0300 1234567');
      expect(body.memory_note).toBe('loves matcha');
    });
  });

  it('offers to merge rather than losing the form on a duplicate', async () => {
    respond(409, {
      code: 'duplicate_guest',
      message: 'Sana R. is already in your guests with those details.',
    });

    renderModal();
    await userEvent.type(screen.getByLabelText('Name'), 'Sana');
    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    // Merging blends allergy records, so the host decides — but they should
    // not have to start over to do it.
    expect(await screen.findByRole('alert')).toHaveTextContent('already in your guests');
    expect(screen.getByRole('button', { name: 'Add to their history' })).toBeInTheDocument();
  });

  it('retries with the merge flag when confirmed', async () => {
    respond(409, { code: 'duplicate_guest', message: 'Already there.' });

    renderModal();
    await userEvent.type(screen.getByLabelText('Name'), 'Sana');
    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    respond(201, { id: 'existing', full_name: 'Sana R.' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add to their history' }));

    await waitFor(() => {
      const url = String(fetchImpl.mock.calls.at(-1)![0]);
      expect(url).toContain('merge_duplicates=true');
    });
  });

  it('lets the host go back and edit instead of merging', async () => {
    respond(409, { code: 'duplicate_guest', message: 'Already there.' });

    renderModal();
    await userEvent.type(screen.getByLabelText('Name'), 'Sana');
    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }));

    // The typed name survives the round trip.
    expect(screen.getByLabelText('Name')).toHaveValue('Sana');
  });

  it('shows a field error against the right input', async () => {
    respond(422, {
      code: 'validation_failed',
      message: 'Some details need a second look.',
      details: { fields: [{ field: 'email', message: 'That email looks off.' }] },
    });

    renderModal();
    await userEvent.type(screen.getByLabelText('Name'), 'Sana');
    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    expect(await screen.findByText('That email looks off.')).toBeInTheDocument();
  });

  it('hands the created guest back to the caller', async () => {
    const onCreated = vi.fn();
    respond(201, { id: 'g1', full_name: 'Hira S.' });

    renderModal({ onCreated });
    await userEvent.type(screen.getByLabelText('Name'), 'Hira S.');
    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'g1', full_name: 'Hira S.' }));
  });

  it('clears the form after closing', async () => {
    const onClose = vi.fn();
    respond(201, { id: 'g1', full_name: 'Hira' });

    const { rerender } = renderModal({ onClose });
    await userEvent.type(screen.getByLabelText('Name'), 'Hira');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    rerender(
      <Wrapper>
        <AddGuestModal open onClose={onClose} />
      </Wrapper>,
    );

    // Reopening should not resurrect a half-typed guest.
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });
});
