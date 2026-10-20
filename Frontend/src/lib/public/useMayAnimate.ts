import { useEffect, useState } from 'react';

/**
 * Whether it's reasonable to spend a guest's battery and, on some
 * connections, their data plan on a decorative animation.
 *
 * Three separate signals, any one of which is enough to say no:
 * `prefers-reduced-motion`, the OS-level accessibility setting; Data Saver,
 * which a visitor turns on specifically to ask sites to do less; and a
 * connection the browser itself already classifies as slow.
 *
 * False until it has looked, and false wherever it cannot look — a missing
 * `matchMedia` (some test environments, a handful of embedded WebViews) means
 * "can't ask", and the safe default for a guest we can't ask is to do less.
 *
 * One copy for the whole page. The hero and the ceramic showcase each used to
 * carry their own, and a third was about to join them.
 */
export function useMayAnimate(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    type NetworkInformation = { saveData?: boolean; effectiveType?: string };
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    const dataConscious = Boolean(
      connection?.saveData ||
      connection?.effectiveType === 'slow-2g' ||
      connection?.effectiveType === '2g',
    );

    const evaluate = () => setAllowed(!motionQuery.matches && !dataConscious);
    evaluate();

    motionQuery.addEventListener('change', evaluate);
    return () => motionQuery.removeEventListener('change', evaluate);
  }, []);

  return allowed;
}
