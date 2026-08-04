'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * A modal dialog.
 *
 * Hand-rolled rather than pulled from a library because the behaviour is
 * small and the accessibility requirements are specific: focus must move in
 * and be trapped, Escape must close, the page behind must not scroll, and
 * focus must return to whatever opened it.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons, rendered bottom-right. */
  footer?: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const focusables = useCallback(
    () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    [],
  );

  // Remember what had focus, move into the dialog, and restore on close —
  // otherwise a keyboard user is dumped back at the top of the document.
  useEffect(() => {
    if (!open) return;

    returnFocusTo.current = document.activeElement as HTMLElement | null;
    const first = focusables()[0] ?? dialogRef.current;
    first?.focus();

    return () => returnFocusTo.current?.focus();
  }, [open, focusables]);

  // The page behind a modal must not scroll under it.
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, focusables]);

  if (!open) return null;

  return (
    <div
      className="bg-cocoa/40 fixed inset-0 z-50 grid place-items-center p-4 backdrop-blur-[3px]"
      // Clicking the backdrop closes; clicking inside must not.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={cn(
          'max-h-[90vh] w-[min(460px,100%)] overflow-y-auto rounded-[var(--radius-lg)]',
          'bg-paper p-6 shadow-[var(--shadow-soft)]',
          className,
        )}
      >
        <h2 id="modal-title" className="font-display mb-4 text-xl">
          {title}
        </h2>

        {children}

        {footer ? <div className="mt-4 flex flex-wrap justify-end gap-2.5">{footer}</div> : null}
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

export const inputClasses =
  'min-h-[44px] w-full rounded-[var(--radius-sm)] border-[1.5px] border-line bg-buttercream px-3.5 text-sm text-cocoa';
