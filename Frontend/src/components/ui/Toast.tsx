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
import { prefersReducedMotion } from '@/lib/public/motion';

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

/*
 * Re-exported, not reimplemented.
 *
 * There were two of these with *opposite* fallbacks when `matchMedia` is
 * missing: `lib/public/motion` answered "assume reduced", this one answered
 * "assume full motion". Same name, same question, different answer depending
 * on which file you happened to import — and the safe default for a visitor
 * who cannot be asked is to do less.
 */
export { prefersReducedMotion };

export interface ToastProviderProps {
  children: ReactNode;
  /**
   * Utility classes setting `--tab-bar-h` to the height of whatever fixed
   * bottom bar this surface renders, so the toast can clear it.
   *
   * It is a class rather than a number because the answer is responsive: the
   * host shell's tab bar exists below `lg` and vanishes above it. It is
   * passed in rather than read from the shell because the toast is a sibling
   * of the shell, not a descendant — see the wrapper below.
   */
  offsetClassName?: string;
}

export function ToastProvider({ children, offsetClassName }: ToastProviderProps) {
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
      {/*
        `display: contents` — no box, no layout effect, but still a node in the
        DOM tree, which is all a custom property needs in order to inherit.

        The toast is rendered here, as a sibling of the app shell rather than
        inside it, so a `--tab-bar-h` set on the shell's own root would never
        reach it. Wrapping both in one contents-only element puts them under a
        common ancestor and the variable resolves for each.
      */}
      <div className={cn('contents', offsetClassName)}>
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
              /*
               * Above the tab bar, not on top of it.
               *
               * `bottom-6` put the pill at y 744–788 on a 812px screen while
               * the host tab bar occupied y 747–812: the confirmation that an
               * action had worked covered the navigation you would use next.
               * The fallback of `0px` keeps the original 1rem inset on
               * surfaces with no bottom bar — desktop, and the open chat
               * thread, which hides its shell.
               */
              'fixed bottom-[calc(var(--tab-bar-h,0px)+env(safe-area-inset-bottom)+1rem)]',
              'left-1/2 z-60 -translate-x-1/2 rounded-[var(--radius-pill)]',
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
      </div>
    </ToastContext.Provider>
  );
}
