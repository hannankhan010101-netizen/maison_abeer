'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * The behaviour every overlay in this app owes a keyboard user.
 *
 * Focus moves in on open and returns to whatever opened it on close, Tab
 * wraps rather than escaping to the page behind, Escape closes, and the page
 * underneath stops scrolling.
 *
 * Extracted from `ui/Modal`, which had all of it right, because the phone
 * navigation's "More" sheet had none of it: Escape did nothing, focus never
 * entered the sheet, and Tab walked straight out of it into the tab bar
 * underneath. Two overlays, one of them silently worse, is exactly the kind
 * of drift a shared hook prevents — a third overlay added later gets it for
 * free rather than getting it wrong.
 *
 * Everything that touches the document rather than the overlay — the scroll
 * lock and the keydown listener — is therefore bookkept for *all* open
 * overlays at module scope, below. Doing either per-overlay is only correct
 * while exactly one is open, and nothing here can enforce that.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/*
 * `document.body.style.overflow` is a global, so the correct unit is a count —
 * not a value saved per overlay.
 *
 * Two locks are already reachable without anyone adding a third overlay:
 * `moreOpen` in AppShell's MobileTabs survives the `lg` breakpoint, where the
 * sheet is `lg:hidden` and so goes invisible while its lock and its Escape
 * listener stay live, and any page `Modal` opened after that is the second.
 * Saving and restoring instead, the second overlay records `'hidden'` as the
 * value to put back, so the *first* one to close unlocks the page behind the
 * other and the last one to close locks the document with nothing on screen.
 */
let locks = 0;
let restore = '';

function lockScroll(): () => void {
  if (locks === 0) {
    restore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  locks += 1;

  return () => {
    /*
     * Clamped, not a bare `--locks`. A single skipped cleanup would otherwise
     * leave the count permanently above zero and the page permanently
     * unscrollable — strictly worse than the bug being fixed, which at least
     * self-heals on the next open and close. A count that can only be driven
     * to zero is the safe version of the same idea.
     */
    if (locks > 0 && --locks === 0) document.body.style.overflow = restore;
  };
}

/*
 * The open overlays, innermost last.
 *
 * The Escape and Tab listeners are on `document`, where order is registration
 * order rather than stacking order — so with two overlays open, one keypress
 * closed both and Tab was trapped by whichever registered first. Acting only
 * when an overlay is the top of this stack fixes both with the bookkeeping the
 * lock already needs. (Not `stopPropagation` on the overlay: these listeners
 * never see a bubbling path that reflects which overlay is on top.)
 */
const stack: { close: () => void }[] = [];

export function useDismissable<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const focusables = useCallback(
    () => Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    [],
  );

  // Remember what had focus, move into the overlay, and restore on close —
  // otherwise a keyboard user is dumped back at the top of the document.
  useEffect(() => {
    if (!open) return;

    returnFocusTo.current = document.activeElement as HTMLElement | null;
    const first = focusables()[0] ?? ref.current;
    first?.focus();

    return () => returnFocusTo.current?.focus();
  }, [open, focusables]);

  // The page behind an overlay must not scroll under it.
  useEffect(() => {
    if (!open) return;
    return lockScroll();
  }, [open]);

  // Read by the keydown listener below, which is registered once per open
  // rather than once per `onClose` identity — re-registering would move this
  // overlay to the top of the stack while another one is actually on top.
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const entry = { close: () => latestClose.current() };
    stack.push(entry);

    function onKeyDown(event: KeyboardEvent) {
      // Only the overlay on top answers for the keyboard.
      if (stack[stack.length - 1] !== entry) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        entry.close();
        return;
      }

      if (event.key !== 'Tab') return;

      // Trap: wrap focus at both ends rather than escaping to the page.
      const items = focusables();
      if (items.length === 0) return;

      const first = items[0]!;
      const last = items[items.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      const index = stack.indexOf(entry);
      if (index !== -1) stack.splice(index, 1);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, focusables]);

  return ref;
}
