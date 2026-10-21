import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimNotice } from './ClaimNotice';
import type { ClaimResult } from '@/lib/api/types';

/**
 * The claim used to run silently. A guest whose sign-in email matched no
 * booking landed on "Nothing here yet" with no idea why; a failed check looked
 * exactly the same. The notice says which of the two it was and what to do.
 */

interface ClaimState {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  data: ClaimResult | undefined;
}

const mutate = vi.fn();
let state: ClaimState;

vi.mock('@/lib/api/hooks', () => ({
  useClaimAccount: () => ({ ...state, mutate }),
}));

beforeEach(() => {
  mutate.mockReset();
  state = { isPending: true, isError: false, isSuccess: false, data: undefined };
});

function settled(data: ClaimResult) {
  state = { isPending: false, isError: false, isSuccess: true, data };
}

describe('ClaimNotice', () => {
  it('renders nothing while the check is running', () => {
    const { container } = render(<ClaimNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once the account is matched', () => {
    settled({ claimed: true, display_name: 'Sana R.', message: "You're in." });
    const { container } = render(<ClaimNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains an unmatched account with the server message and what to do', () => {
    settled({
      claimed: false,
      display_name: null,
      message: 'We need an email address to find your booking.',
    });
    render(<ClaimNotice />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('We need an email address to find your booking.');
    expect(status).toHaveTextContent(
      'Use the email you booked with, or ask your studio to resend your link',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when the check itself fails, and lets the guest try again', () => {
    state = { isPending: false, isError: true, isSuccess: false, data: undefined };
    render(<ClaimNotice />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("We couldn't check your bookings just now");
    expect(mutate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it('checks exactly once on mount', () => {
    render(<ClaimNotice />);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('checks exactly once on mount under StrictMode', () => {
    render(
      <StrictMode>
        <ClaimNotice />
      </StrictMode>,
    );
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
