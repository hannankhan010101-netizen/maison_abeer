import { useEffect, useState } from 'react';

/**
 * Where the guest is on the storefront, as far as the floating pill cares:
 * is the hero on screen, and is the booking card on screen.
 *
 * Both are watched with an `IntersectionObserver`, so there is no scroll
 * handler. Where the hero is not found (a page without one) or there is no
 * observer, `heroVisible` stays true, so the pill never appears: leaving it
 * out is always safe, the hero's own button and every chapter's link still
 * lead to the card.
 */

/** The hero is the first `header` directly under `main`. */
function findHero(): Element | null {
  return document.querySelector('main > header');
}

export function useStorefrontPosition(): { heroVisible: boolean; widgetVisible: boolean } {
  const [heroVisible, setHeroVisible] = useState(true);
  const [widgetVisible, setWidgetVisible] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return;

    const observers = new Set<IntersectionObserver>();

    // One watcher per target. It looks the target up each time it is asked and
    // moves to a new element if the old one has been replaced: the storefront
    // swaps its loading placeholder for the loaded page, which throws away the
    // booking card the first lookup found. Watching only the first would leave
    // the pill convinced the card was off screen, on top of the card.
    const watcher = (find: () => Element | null, report: (visible: boolean) => void) => {
      let current: { target: Element; observer: IntersectionObserver } | null = null;

      return () => {
        const target = find();
        if (!target || target === current?.target) return;

        if (current) {
          current.observer.disconnect();
          observers.delete(current.observer);
        }
        const observer = new IntersectionObserver((entries) => {
          const last = entries[entries.length - 1];
          // A callback already queued for a replaced element is stale.
          if (last && current?.observer === observer) report(last.isIntersecting);
        });
        current = { target, observer };
        observers.add(observer);
        observer.observe(target);
      };
    };

    // The hero is rendered only once the studio's details have arrived, which
    // is after this effect first runs, so the lookups are retried whenever the
    // page's direct children change.
    const watchers = [
      watcher(findHero, setHeroVisible),
      watcher(() => document.getElementById('booking-widget'), setWidgetVisible),
    ];
    const attach = () => watchers.forEach((run) => run());

    attach();
    const main = document.getElementById('main');
    const mutations = main ? new MutationObserver(attach) : null;
    if (main && mutations) mutations.observe(main, { childList: true });

    return () => {
      mutations?.disconnect();
      observers.forEach((observer) => observer.disconnect());
    };
  }, []);

  return { heroVisible, widgetVisible };
}
