import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EnterFailed, EnterWaiting } from './EnterStates';

/** The recovery link's waiting and failure states: presentation only. */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EnterWaiting', () => {
  it('is a polite status that says what is happening, with no visible digits', () => {
    const { container } = render(<EnterWaiting />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status.querySelector('.sr-only')).toHaveTextContent('Signing you in');
    expect(container.textContent).toMatch(/^\D*$/);
  });

  it('offers no action', () => {
    render(<EnterWaiting />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('EnterFailed', () => {
  it('spent: says the link is used and offers no retry', () => {
    render(<EnterFailed kind="spent" />);

    expect(screen.getByRole('alert')).toHaveTextContent('That link has already been used');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('broken: says it is our side and offers one 44px Try again that reloads', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    render(<EnterFailed kind="broken" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/We couldn.t sign you in just now/);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);

    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry.className).toMatch(/min-h-\[44px\]/);

    fireEvent.click(retry);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('keeps the illustration out of the accessibility tree', () => {
    const { container } = render(<EnterFailed kind="spent" />);

    for (const svg of container.querySelectorAll('svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
