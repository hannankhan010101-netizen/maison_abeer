import { useEffect, useRef, useState } from 'react';

/**
 * Whether the cast is in (or near) the viewport, so its idle motion can rest
 * while scrolled away.
 *
 * The same observer as `useIsOnScreen`, with one difference that matters in
 * the first screen: where `IntersectionObserver` does not exist it assumes
 * "on screen" instead of throwing, because a crash here would take the whole
 * hero down with it.
 */
export function useCastOnScreen<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(Boolean(entry?.isIntersecting)),
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, onScreen];
}
