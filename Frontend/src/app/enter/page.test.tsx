import { StrictMode } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

/**
 * The recovery link's redeem logic, pinned before any redesign.
 *
 * The token is single-use: a second redeem is not a retry, it is a guaranteed
 * failure that reports a good session as spent. And the token must leave the
 * address bar before anything touches the network.
 */

let search = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
}));

const redeemPortalToken =
  vi.fn<(token: string, type: 'signup' | 'magiclink') => Promise<boolean>>();

vi.mock('@/lib/supabase/client', () => ({
  redeemPortalToken: (token: string, type: 'signup' | 'magiclink') =>
    redeemPortalToken(token, type),
}));

import EnterPage from './page';

const assign = vi.fn();
let replaceState: MockInstance<History['replaceState']>;

beforeEach(() => {
  search = new URLSearchParams();
  redeemPortalToken.mockReset();
  assign.mockReset();
  vi.stubGlobal('location', { ...window.location, assign, reload: vi.fn() });
  replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  replaceState.mockRestore();
});

describe('/enter', () => {
  it('redeems once under StrictMode, with the token and type', async () => {
    search = new URLSearchParams('token=abc123');
    redeemPortalToken.mockResolvedValue(true);

    render(
      <StrictMode>
        <EnterPage />
      </StrictMode>,
    );

    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(redeemPortalToken).toHaveBeenCalledTimes(1);
    expect(redeemPortalToken).toHaveBeenCalledWith('abc123', 'magiclink');
  });

  it('strips the token from the address bar before the network', async () => {
    search = new URLSearchParams('token=abc123');
    redeemPortalToken.mockResolvedValue(true);

    render(<EnterPage />);

    await waitFor(() => expect(redeemPortalToken).toHaveBeenCalled());
    expect(replaceState).toHaveBeenCalledWith(null, '', '/enter');
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(
      redeemPortalToken.mock.invocationCallOrder[0]!,
    );
  });

  it('passes type=signup through, and anything else as magiclink', async () => {
    search = new URLSearchParams('token=one&type=signup');
    redeemPortalToken.mockResolvedValue(true);
    const { unmount } = render(<EnterPage />);
    await waitFor(() => expect(redeemPortalToken).toHaveBeenCalledWith('one', 'signup'));
    unmount();

    search = new URLSearchParams('token=two&type=recovery');
    render(<EnterPage />);
    await waitFor(() => expect(redeemPortalToken).toHaveBeenCalledWith('two', 'magiclink'));
  });

  it('navigates to /portal on success', async () => {
    search = new URLSearchParams('token=abc123');
    redeemPortalToken.mockResolvedValue(true);

    render(<EnterPage />);

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/portal'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reads a false result as a used link', async () => {
    search = new URLSearchParams('token=abc123');
    redeemPortalToken.mockResolvedValue(false);

    render(<EnterPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/already been used/);
    expect(assign).not.toHaveBeenCalled();
  });

  it('reads a throw as our side, not the link', async () => {
    search = new URLSearchParams('token=abc123');
    redeemPortalToken.mockRejectedValue(new Error('network down'));

    render(<EnterPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t sign you in just now/);
    expect(assign).not.toHaveBeenCalled();
  });

  it('reads no token as a used link, without touching the network', async () => {
    render(<EnterPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/already been used/);
    expect(redeemPortalToken).not.toHaveBeenCalled();
  });

  it('shows a status while it signs in', () => {
    search = new URLSearchParams('token=abc123');
    redeemPortalToken.mockReturnValue(new Promise(() => undefined));

    render(<EnterPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Signing you in');
  });
});
