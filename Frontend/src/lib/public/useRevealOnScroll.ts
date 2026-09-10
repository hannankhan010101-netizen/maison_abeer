import { useEffect, useRef, useState } from 'react';

/**
 * Whether an element has scrolled into view — once. Everywhere on this page
 * that used to animate on mount (`animate-rise-in` with a fixed delay) was
 * spending that animation before the guest ever scrolled far enough to see
 * it: a section three screens down finishes rising in while still off-screen,
 * so scrolling to it shows a static, already-settled block. Triggering on
 * first intersection instead means the reveal actually happens in front of
 * the guest, which is the entire point of a reveal animation.
 *
 * Fires once and disconnects — a card that's already been seen has no
 * reason to re-animate every time it's scrolled past again, and doing so
 * reads as jittery rather than polished.
 */
export function useRevealOnScroll<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No IntersectionObserver (very old browser, some test environments):
    // show it immediately rather than leaving content permanently hidden.
    if (typeof IntersectionObserver !== 'function') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, visible];
}
