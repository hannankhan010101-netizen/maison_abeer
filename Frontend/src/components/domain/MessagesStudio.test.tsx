import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MessagesStudio } from './MessagesStudio';
import { ApiClient } from '@/lib/api/client';
import { createQueryClient } from '@/lib/api/provider';

// The voice previews are computed in the browser, but the screen now also
// carries the reminder queue, which reads sessions from the API.
const fetchImpl = vi
  .fn()
  .mockResolvedValue(
    new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );

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

function withProviders(node: ReactNode) {
  return <QueryClientProvider client={createQueryClient()}>{node}</QueryClientProvider>;
}

describe('MessagesStudio', () => {
  it('starts in soft & sweet', async () => {
    render(withProviders(<MessagesStudio />));

    expect(screen.getByRole('radio', { name: /Soft & sweet/ })).toBeChecked();
    expect(screen.getByText(/We can't wait to see you tomorrow at 2 pm/)).toBeInTheDocument();
  });

  it('rewrites every preview when the voice changes', async () => {
    render(withProviders(<MessagesStudio />));

    await userEvent.click(screen.getByRole('radio', { name: /Chaotic bestie/ }));

    // Both bubbles change, not just the one being demonstrated.
    expect(screen.getByText(/BESTIE/)).toBeInTheDocument();
    expect(screen.getByText(/You ATE that/)).toBeInTheDocument();
    expect(screen.queryByText(/We can't wait to see you/)).not.toBeInTheDocument();
  });

  it('switches to clean & minimal', async () => {
    render(withProviders(<MessagesStudio />));

    await userEvent.click(screen.getByRole('radio', { name: /Clean & minimal/ }));

    expect(screen.getByText(/^Reminder: Bento cake, tomorrow 2 pm/)).toBeInTheDocument();
  });

  it('strips emoji at the lowest density', async () => {
    render(withProviders(<MessagesStudio />));

    await userEvent.click(screen.getByRole('radio', { name: 'None' }));

    const reminder = screen.getByText(/We can't wait to see you/);
    expect(/\p{Extended_Pictographic}/u.test(reminder.textContent ?? '')).toBe(false);
  });

  it('announces preview changes to assistive technology', () => {
    const { container } = render(withProviders(<MessagesStudio />));

    // Switching voice replaces this text; a screen reader should hear it.
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('describes the selected voice', async () => {
    render(withProviders(<MessagesStudio />));

    expect(screen.getByText('Warm, gentle, lots of heart')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /Chaotic bestie/ }));
    expect(screen.getByText('Caps lock and affection')).toBeInTheDocument();
  });

  it('shows the full send schedule', () => {
    render(withProviders(<MessagesStudio />));

    expect(screen.getByText('T-24h · guest reminder')).toBeInTheDocument();
    expect(screen.getByText('T-3h · host nudge')).toBeInTheDocument();
    expect(screen.getByText('T+24h · thank you + feedback')).toBeInTheDocument();
  });

  it('marks the host nudge as not going to guests', () => {
    render(withProviders(<MessagesStudio />));
    expect(screen.getByText('Just for you')).toBeInTheDocument();
  });

  it('states the quiet hours window', () => {
    render(withProviders(<MessagesStudio />));
    expect(screen.getByText(/9 am – 9 pm only/)).toBeInTheDocument();
  });

  it('labels the emoji feedback buttons in words', async () => {
    render(withProviders(<MessagesStudio />));

    // An emoji alone has no reliable accessible name.
    const loved = screen.getByRole('button', { name: 'Loved it' });
    expect(loved).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(loved);
    expect(loved).toHaveAttribute('aria-pressed', 'true');
  });

  it('gives every control a 44px touch target', () => {
    render(withProviders(<MessagesStudio />));

    for (const control of [...screen.getAllByRole('radio'), ...screen.getAllByRole('button')]) {
      expect(control).toHaveClass('min-h-[44px]');
    }
  });
});
