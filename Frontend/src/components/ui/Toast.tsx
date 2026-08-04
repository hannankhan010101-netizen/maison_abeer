'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/cn';

/**
 * Toasts and celebrations.
 *
 * The prototype confirms actions with a small dark pill and marks wins with a
 * confetti burst. Both live here so any screen can reach them, and both
 * respect reduced-motion: confetti is suppressed entirely, and the toast still
 * appears because it carries information, not decoration.
 */

export type ToastTone = 'default' | 'success' | 'error';

interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  celebrate: (message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);

  if (!value) {
    throw new Error('useToast must be used inside <ToastProvider>.');
  }

  return value;
}

const VISIBLE_MS = 3200;
const CONFETTI = ['✨', '🎀', '💗', '🌷', '🧁'];

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastState | null>(null);
  const [confetti, setConfetti] = useState<number[]>([]);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string, tone: ToastTone = 'default') => {
    if (timer.current) clearTimeout(timer.current);

    nextId.current += 1;
    setCurrent({ id: nextId.current, message, tone });

    timer.current = setTimeout(() => setCurrent(null), VISIBLE_MS);
  }, []);

  const celebrate = useCallback(
    (message?: string) => {
      if (message) toast(message, 'success');

      // Motion is the decoration; the message carries the meaning, so a
      // reduced-motion user loses nothing but the animation.
      if (prefersReducedMotion()) return;

      setConfetti(Array.from({ length: 16 }, (_, index) => index));
      setTimeout(() => setConfetti([]), 1500);
    },
    [toast],
  );

  const value = useMemo(() => ({ toast, celebrate }), [toast, celebrate]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Polite, not assertive: a confirmation should not cut across whatever
          the host is reading. */}
      <div role="status" aria-live="polite" className="sr-only">
        {current?.message ?? ''}
      </div>

      {current ? (
        <div
          data-testid="toast"
          className={cn(
            'fixed bottom-6 left-1/2 z-60 -translate-x-1/2 rounded-[var(--radius-pill)]',
            'px-5 py-3 text-sm font-extrabold shadow-[var(--shadow-soft)]',
            current.tone === 'error'
              ? 'bg-danger-soft text-danger border-danger-line border-[1.5px]'
              : 'bg-cocoa text-buttercream',
          )}
        >
          {current.message}
        </div>
      ) : null}

      {confetti.length > 0 ? (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-70">
          {confetti.map((index) => (
            <span
              key={index}
              className="absolute animate-[fall_1.15s_ease-in_forwards] text-lg"
              style={{
                left: `${20 + Math.random() * 60}%`,
                top: `${25 + Math.random() * 20}%`,
                animationDelay: `${Math.random() * 0.25}s`,
              }}
            >
              {CONFETTI[index % CONFETTI.length]}
            </span>
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
