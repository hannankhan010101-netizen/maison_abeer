'use client';

import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { useDismissable } from '@/lib/useDismissable';

/**
 * A modal dialog.
 *
 * Hand-rolled rather than pulled from a library because the behaviour is
 * small and the accessibility requirements are specific — all of which now
 * live in `useDismissable`, shared with the phone navigation's sheet.
 *
 * On a phone it is a bottom sheet, not a centred card. A centred dialog puts
 * its primary action in the middle of the screen, which on a 812px phone is
 * roughly 400px from where a one-handed thumb rests; rising from the bottom
 * edge instead puts the action where the hand already is, and is what every
 * phone OS does with its own sheets. From `sm` up it is the centred card it
 * has always been.
 */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons, rendered bottom-right on desktop and stacked on a phone. */
  footer?: ReactNode;
  /**
   * The last footer child is destructive, so the *safe* action goes lowest.
   *
   * ADR 0003 decision 4 stacks the footer in DOM order because every footer is
   * written secondary-first, which puts the primary action nearest the thumb.
   * `CancelBookingModal` is the one exception in the app: its last child is the
   * `danger` button, so the default would make "Cancel the seat" the lowest,
   * full-width control in a sheet resting on the screen edge, with the escape
   * hatch further from the thumb. Opt in and the column reverses below `sm`.
   *
   * Below `sm` only. Reversing the desktop row as well would put the visual
   * order out of step with Tab and the reading order for keyboard users, who
   * are overwhelmingly at desktop width; the hazard being fixed is a thumb.
   */
  destructiveFooterAction?: boolean;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  destructiveFooterAction = false,
  className,
}: ModalProps) {
  const dialogRef = useDismissable<HTMLDivElement>(open, onClose);

  // `useId`, not a hardcoded "modal-title". `Modal` cannot see its call sites,
  // and not every one keeps its dialogs on a single discriminant the way
  // `SessionDetail` does: `SessionRoster` drives `BookSomeoneInModal` and
  // `CancelBookingModal` off two independent flags, where only the focus trap
  // and the backdrop stop both being open at once. A generated id costs
  // nothing and does not depend on that staying true.
  const titleId = useId();

  if (!open) return null;

  return (
    <div
      className={cn(
        'bg-cocoa/40 fixed inset-0 z-50 grid backdrop-blur-[3px]',
        // Phone: pinned to the bottom edge, full width, no outer padding.
        'items-end justify-items-center',
        // Desktop: the centred card.
        'sm:place-items-center sm:p-4',
      )}
      // Clicking the backdrop closes; clicking inside must not.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          /*
           * `dvh`, not `vh`.
           *
           * `vh` is measured against the viewport with the browser toolbar
           * and the keyboard ignored, so `90vh` on a focused form is taller
           * than the space actually available — and the submit button ends up
           * behind the keyboard with no scroll offset able to reveal it.
           * `ChatThread` already documents this trap; the modal was still
           * falling into it.
           */
          'max-h-[90dvh] overflow-y-auto',
          'bg-paper p-6 shadow-[var(--shadow-soft)]',
          // Phone: a sheet. Only the top corners are round — the bottom two
          // sit off the edge of the screen.
          'w-full rounded-t-[var(--radius-lg)]',
          'pb-[max(1.5rem,env(safe-area-inset-bottom))]',
          // Desktop: unchanged.
          'sm:w-[min(460px,100%)] sm:rounded-[var(--radius-lg)] sm:pb-6',
          className,
        )}
      >
        <h2 id={titleId} className="font-display mb-4 text-xl">
          {title}
        </h2>

        {children}

        {footer ? (
          /*
           * A full-width column on a phone.
           *
           * Every footer in the app is written secondary-first and primary
           * last, because on desktop they read left to right into a
           * `justify-end` row. Stacking in that same order puts the primary
           * action lowest — nearest the thumb, and the last thing above the
           * keyboard — so no call site has to reorder itself for mobile.
           *
           * That reasoning inverts for the one footer whose last child is
           * destructive; `destructiveFooterAction` above is how that call site
           * says so, rather than reordering its own children.
           */
          <div
            className={cn(
              'mt-4 flex gap-2.5 sm:flex-wrap sm:justify-end [&>*]:w-full sm:[&>*]:w-auto',
              destructiveFooterAction ? 'flex-col-reverse sm:flex-row' : 'flex-col sm:flex-row',
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A labelled field, so every form in the app looks and behaves the same. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label
        htmlFor={htmlFor}
        className="text-latte mb-1.5 block text-xs font-extrabold tracking-[0.06em] uppercase"
      >
        {label}
      </label>

      {children}

      {hint && !error ? <p className="text-latte mt-1 text-xs">{hint}</p> : null}

      {error ? (
        // Bound to the input via aria-describedby by the caller.
        <p id={`${htmlFor}-error`} className="text-danger mt-1 text-xs font-extrabold">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The shared field styling.
 *
 * **No `text-sm` here.** `globals.css` sets `input, select, textarea` to
 * `max(16px, 1em)` so iOS Safari does not zoom the page on focus — but that
 * lives in the `base` layer, and any Tailwind text utility sits in
 * `utilities`, which wins. A `text-sm` on this line silently defeated the
 * rule on every form that uses it, and the guard test missed it because the
 * settings form had not finished rendering when it looked.
 *
 * 16px is the floor, not a preference. Below it, focusing a field on an
 * iPhone zooms the viewport and leaves the user scrolled sideways mid-form.
 */
export const inputClasses =
  'min-h-[44px] w-full rounded-[var(--radius-sm)] border-[1.5px] border-line bg-buttercream px-3.5 text-cocoa';
