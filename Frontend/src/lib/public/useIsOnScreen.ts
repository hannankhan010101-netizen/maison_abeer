import { useEffect, useRef, useState } from 'react';

/**
 * Whether an element is currently in (or near) the viewport — used to pause
 * a WebGL render loop entirely while its canvas is scrolled off-screen.
 * Off-screen, this costs nothing: no GPU work, no battery. Shared by every
 * 3D scene on this page rather than each reimplementing the same observer.
 */
export function useIsOnScreen<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)), {
      rootMargin: '200px',
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, onScreen];
}
