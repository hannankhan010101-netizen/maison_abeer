import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LoginPage from './page';

/**
 * Characterisation: the sign-in form's hardening, pinned before the redesign
 * so the new look cannot quietly change what the form does.
 */

const replace = vi.fn();
const refresh = vi.fn();
let next: string | null = null;
const signInWithPassword = vi.fn();
const getClient = vi.fn(() => ({ auth: { signInWithPassword } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'next' ? next : null) }),
  usePathname: () => '/login',
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => getClient(),
}));

async function signIn() {
  const user = userEvent.setup();
  render(<LoginPage />);
  await user.type(screen.getByLabelText('Email'), 'host@studio.test');
  await user.type(screen.getByLabelText('Password'), 'secret-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  next = null;
  replace.mockReset();
  refresh.mockReset();
  signInWithPassword.mockReset();
  getClient.mockImplementation(() => ({ auth: { signInWithPassword } }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LoginPage', () => {
  it('signs in disabled until mounted', () => {
    // The server's HTML is the first render: no effect has run yet.
    const html = renderToString(<LoginPage />);
    const button = /<button[^>]*type="submit"[^>]*>/.exec(html)?.[0] ?? '';
    expect(button).toMatch(/\sdisabled(=""|\s|>)/);

    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('shows one message for any failure', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    await signIn();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/don't match|couldn't reach/);
    expect(alert.textContent).not.toContain('Invalid login credentials');
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows one message when the client itself throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getClient.mockImplementation(() => {
      throw new Error('Supabase URL missing');
    });
    await signIn();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/don't match|couldn't reach/);
    expect(alert.textContent).not.toContain('Supabase URL missing');
  });

  it('only follows a same-origin next', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    next = 'https://evil.test';
    await signIn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('follows a same-origin next', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    next = '/calendar';
    await signIn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/calendar'));
  });

  it('form posts', () => {
    const { container } = render(<LoginPage />);
    expect(container.querySelector('form')?.getAttribute('method')).toBe('post');
  });
});
