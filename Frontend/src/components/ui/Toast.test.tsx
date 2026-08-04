import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from './Toast';

function Harness() {
  const { toast, celebrate } = useToast();

  return (
    <>
      <button type="button" onClick={() => toast('session added')}>
        notify
      </button>
      <button type="button" onClick={() => toast('that failed', 'error')}>
        fail
      </button>
      <button type="button" onClick={() => celebrate('SOLD OUT! 🎀')}>
        celebrate
      </button>
    </>
  );
}

function renderHarness() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

/** Simulate a reduced-motion preference. */
function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider', () => {
  it('throws a clear error when used outside the provider', () => {
    // Otherwise the failure surfaces as "cannot read property of null".
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Harness />)).toThrow(/must be used inside/);
    spy.mockRestore();
  });

  it('shows a message', async () => {
    setReducedMotion(false);
    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'notify' }));

    expect(screen.getByTestId('toast')).toHaveTextContent('session added');
  });

  it('announces politely rather than interrupting', async () => {
    setReducedMotion(false);
    const { container } = renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'notify' }));

    const live = container.querySelector('[aria-live]');
    // A confirmation should not cut across whatever is being read.
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('session added');
  });

  it('styles a failure differently', async () => {
    setReducedMotion(false);
    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'fail' }));

    expect(screen.getByTestId('toast')).toHaveClass('text-danger');
  });

  it('replaces the previous message rather than stacking', async () => {
    setReducedMotion(false);
    renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'notify' }));
    await userEvent.click(screen.getByRole('button', { name: 'fail' }));

    expect(screen.getAllByTestId('toast')).toHaveLength(1);
    expect(screen.getByTestId('toast')).toHaveTextContent('that failed');
  });

  it('dismisses itself', async () => {
    setReducedMotion(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderHarness();
    await userEvent.click(screen.getByRole('button', { name: 'notify' }));

    // Wrapped in act: advancing the timer triggers a React state update, and
    // an unwrapped one warns rather than failing — easy to stop noticing.
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    await waitFor(() => expect(screen.queryByTestId('toast')).not.toBeInTheDocument());
  });

  it('fires confetti on a celebration', async () => {
    setReducedMotion(false);
    const { container } = renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'celebrate' }));

    expect(container.querySelectorAll('.animate-\\[fall_1\\.15s_ease-in_forwards\\]').length).toBe(
      16,
    );
  });

  it('suppresses confetti under reduced motion but keeps the message', async () => {
    setReducedMotion(true);
    const { container } = renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'celebrate' }));

    // Motion is decoration; the words carry the meaning (PRD §3.4).
    expect(container.querySelectorAll('[aria-hidden="true"] span')).toHaveLength(0);
    expect(screen.getByTestId('toast')).toHaveTextContent('SOLD OUT! 🎀');
  });

  it('hides confetti from assistive technology', async () => {
    setReducedMotion(false);
    const { container } = renderHarness();

    await userEvent.click(screen.getByRole('button', { name: 'celebrate' }));

    const layer = container.querySelector('.pointer-events-none');
    expect(layer).toHaveAttribute('aria-hidden', 'true');
  });
});
