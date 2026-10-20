import { useEffect, useState } from 'react';

/**
 * The clock, but only once this has rendered in the browser.
 *
 * Rendering a date on the server and again on the client produces a hydration
 * mismatch the moment the two clocks — or the two locales — disagree. Null
 * until mount, so anything date-shaped renders blank once and then right,
 * rather than wrong and then corrected in front of the guest.
 */
export function useMountedNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  return now;
}
