import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDismissable } from './useDismissable';

/**
 * Two overlays open at once, which nothing could reach through the components.
 *
 * Every overlay pair in the app is currently mutually exclusive — the roster's
 * `open={!adding}`/`open={adding}` are complements, and the More sheet sits
 * under the modal backdrop — so this is the only level at which the shared
 * bookkeeping can be held to its promise. It is reachable in the app without
 * anyone adding a third overlay: the More sheet is `lg:hidden`, so widening the
 * window past `lg` leaves it logically open and holding its lock while a page
 * modal opens on top.
 */

function Overlay({ open, onClose, label }: { open: boolean; onClose: () => void; label: string }) {
  const ref = useDismissable<HTMLDivElement>(open, onClose);

  if (!open) return null;

  return (
    <div ref={ref} role="dialog" aria-label={label} tabIndex={-1}>
      <button type="button">{label}</button>
    </div>
  );
}

function Pair(props: {
  first: boolean;
  second: boolean;
  onCloseFirst?: () => void;
  onCloseSecond?: () => void;
}) {
  return (
    <>
      <Overlay open={props.first} onClose={props.onCloseFirst ?? (() => {})} label="first" />
      <Overlay open={props.second} onClose={props.onCloseSecond ?? (() => {})} label="second" />
    </>
  );
}

describe('useDismissable', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('keeps the page locked until the last overlay closes', () => {
    /*
     * Saving and restoring `body.style.overflow` per overlay, the second one to
     * open recorded `'hidden'` as the value to put back. So the first to close
     * unlocked the page behind the other, and the last to close locked the
     * document with nothing on screen — until a reload.
     */
    const { rerender } = render(<Pair first second={false} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Pair first second />);
    rerender(<Pair first={false} second />);

    expect(document.body.style.overflow, 'the page scrolled behind the open overlay').toBe(
      'hidden',
    );

    rerender(<Pair first={false} second={false} />);
    expect(document.body.style.overflow, 'the document was left unscrollable').toBe('');
  });

  it('gives Escape to the overlay on top, not to both', () => {
    // Both listeners are on `document`, where order is registration order and
    // not stacking order, so one keypress used to close everything open.
    const onCloseFirst = vi.fn();
    const onCloseSecond = vi.fn();

    render(<Pair first second onCloseFirst={onCloseFirst} onCloseSecond={onCloseSecond} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCloseSecond).toHaveBeenCalledTimes(1);
    expect(onCloseFirst).not.toHaveBeenCalled();
  });

  it('hands the keyboard back when the overlay on top closes', () => {
    const onCloseFirst = vi.fn();

    const { rerender } = render(<Pair first second onCloseFirst={onCloseFirst} />);
    rerender(<Pair first second={false} onCloseFirst={onCloseFirst} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseFirst).toHaveBeenCalledTimes(1);
  });

  it('still moves focus into the overlay it opens', () => {
    render(<Pair first second={false} />);
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });
});
