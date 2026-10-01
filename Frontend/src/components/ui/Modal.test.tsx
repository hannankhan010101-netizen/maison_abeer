import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from './Modal';

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        title="New session"
        footer={<button type="button">Save</button>}
      >
        <input aria-label="Seats" />
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        <p>body</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a labelled modal dialog when open', () => {
    render(
      <Modal open onClose={() => {}} title="New session">
        <p>body</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('New session');
  });

  it('moves focus into the dialog on open', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    // A keyboard user must land inside, not be left behind the backdrop.
    expect(screen.getByLabelText('Seats')).toHaveFocus();
  });

  it('returns focus to the trigger on close', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });

    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');

    expect(trigger).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab inside the dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    const input = screen.getByLabelText('Seats');
    const save = screen.getByRole('button', { name: 'Save' });

    expect(input).toHaveFocus();

    await userEvent.tab();
    expect(save).toHaveFocus();

    // Wraps rather than escaping to the page behind.
    await userEvent.tab();
    expect(input).toHaveFocus();
  });

  it('wraps backwards too', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
  });

  it('closes when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const backdrop = screen.getByRole('dialog').parentElement!;

    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close when the dialog itself is clicked', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('dialog'));

    expect(onClose).not.toHaveBeenCalled();
  });

  /*
   * The footer's stacking order below `sm`, which nothing asserted.
   *
   * It is a className and so cannot be measured here — `e2e/mobile-occlusion`
   * does that at 375px — but the *order* is the guarantee, and a className is
   * exactly what the next refactor silently drops.
   */
  describe('the stacked footer', () => {
    function footerOf(buttonName: string): string {
      return screen.getByRole('button', { name: buttonName }).parentElement!.className;
    }

    function renderFooter(destructive = false) {
      render(
        <Modal
          open
          onClose={() => {}}
          title="cancel a seat"
          destructiveFooterAction={destructive}
          footer={
            <>
              <button type="button">Keep it</button>
              <button type="button">Do it</button>
            </>
          }
        >
          <p>body</p>
        </Modal>,
      );
    }

    it('stacks in DOM order, putting the primary action nearest the thumb', () => {
      renderFooter();

      // Every footer in the app is written secondary-first, so DOM order is
      // already thumb order.
      expect(footerOf('Do it')).toMatch(/(?:^|\s)flex-col(?=\s|$)/);
    });

    it('reverses below sm when the last child is destructive', () => {
      renderFooter(true);

      // `CancelBookingModal`: the safe action has to be the lowest control in a
      // sheet resting on the screen edge, not the one that cancels a booking.
      expect(footerOf('Do it')).toContain('flex-col-reverse');

      // Desktop keeps reading order, so Tab and the eye stay in step.
      expect(footerOf('Do it')).toContain('sm:flex-row');
    });
  });

  it('locks page scroll while open and restores it after', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.keyboard('{Escape}');
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
