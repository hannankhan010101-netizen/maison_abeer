'use client';

import { useEffect, useState } from 'react';

/**
 * The current time, resolved only after hydration.
 *
 * `new Date()` as a default prop is evaluated twice — once when the server
 * renders and again when the client hydrates — so any text derived from it
 * can differ between the two. React reports that as a hydration mismatch,
 * and the visible symptom is worse than the warning: the greeting can read
 * "good morning" on the server and "good afternoon" on the client, and
 * `toLocaleTimeString` can format differently because Node's locale is not
 * the browser's.
 *
 * Returning `null` until mounted lets callers render a stable placeholder,
 * so the server and the first client render agree by construction.
 *
 * Tests pass `now` explicitly and never see the null phase.
 */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => setNow(new Date()), []);

  return now;
}

/**
 * Resolve an optional `now` prop against the hook.
 *
 * A supplied value wins immediately, which keeps components testable without
 * waiting for an effect.
 */
export function useResolvedNow(provided?: Date): Date | null {
  const clientNow = useNow();
  return provided ?? clientNow;
}
