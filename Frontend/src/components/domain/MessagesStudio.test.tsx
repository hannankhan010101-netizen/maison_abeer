import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MessagesStudio } from './MessagesStudio';

describe('MessagesStudio', () => {
  it('starts in soft & sweet', async () => {
    render(<MessagesStudio />);

    expect(screen.getByRole('radio', { name: /soft & sweet/ })).toBeChecked();
    expect(screen.getByText(/we can't wait to see you tomorrow at 2 pm/)).toBeInTheDocument();
  });

  it('rewrites every preview when the voice changes', async () => {
    render(<MessagesStudio />);

    await userEvent.click(screen.getByRole('radio', { name: /chaotic bestie/ }));

    // Both bubbles change, not just the one being demonstrated.
    expect(screen.getByText(/BESTIE/)).toBeInTheDocument();
    expect(screen.getByText(/you ATE that/)).toBeInTheDocument();
    expect(screen.queryByText(/we can't wait to see you/)).not.toBeInTheDocument();
  });

  it('switches to clean & minimal', async () => {
    render(<MessagesStudio />);

    await userEvent.click(screen.getByRole('radio', { name: /clean & minimal/ }));

    expect(screen.getByText(/^Reminder: bento cake, tomorrow 2 pm/)).toBeInTheDocument();
  });

  it('strips emoji at the lowest density', async () => {
    render(<MessagesStudio />);

    await userEvent.click(screen.getByRole('radio', { name: 'none' }));

    const reminder = screen.getByText(/we can't wait to see you/);
    expect(/\p{Extended_Pictographic}/u.test(reminder.textContent ?? '')).toBe(false);
  });

  it('announces preview changes to assistive technology', () => {
    const { container } = render(<MessagesStudio />);

    // Switching voice replaces this text; a screen reader should hear it.
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('describes the selected voice', async () => {
    render(<MessagesStudio />);

    expect(screen.getByText('warm, gentle, lots of heart')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /chaotic bestie/ }));
    expect(screen.getByText('caps lock and affection')).toBeInTheDocument();
  });

  it('shows the full send schedule', () => {
    render(<MessagesStudio />);

    expect(screen.getByText('T-24h · guest reminder')).toBeInTheDocument();
    expect(screen.getByText('T-3h · host nudge')).toBeInTheDocument();
    expect(screen.getByText('T+24h · thank you + feedback')).toBeInTheDocument();
  });

  it('marks the host nudge as not going to guests', () => {
    render(<MessagesStudio />);
    expect(screen.getByText('just for you')).toBeInTheDocument();
  });

  it('states the quiet hours window', () => {
    render(<MessagesStudio />);
    expect(screen.getByText(/9 am – 9 pm only/)).toBeInTheDocument();
  });

  it('labels the emoji feedback buttons in words', async () => {
    render(<MessagesStudio />);

    // An emoji alone has no reliable accessible name.
    const loved = screen.getByRole('button', { name: 'loved it' });
    expect(loved).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(loved);
    expect(loved).toHaveAttribute('aria-pressed', 'true');
  });

  it('gives every control a 44px touch target', () => {
    render(<MessagesStudio />);

    for (const control of [...screen.getAllByRole('radio'), ...screen.getAllByRole('button')]) {
      expect(control).toHaveClass('min-h-[44px]');
    }
  });
});
