'use client';

import { useEffect, useState, type JSX } from 'react';

import { scrollToId } from '@/lib/public/lenisBridge';

/**
 * The sticky "Save a seat" bar on phones.
 *
 * A guest who has read their way down the page is a long scroll from the
 * booking card, and on a phone the thumb is the only navigation there is. The
 * bar is the way back: it appears once the hero has scrolled out of view (a
 * bar on top of the hero would say the same thing twice), and it steps aside
 * while the booking card is on screen, because by then it would only sit on
 * top of the fields the guest is filling in.
 *
 * Both conditions are watched with an `IntersectionObserver`, so there is no
 * scroll handler. Where the hero is not found (a page without one) or there
 * is no observer, the bar never appears: leaving it out is always safe, the
 * hero's own button and every chapter's link still lead to the card.
 *
 * Phones only (`md:hidden`): from `md` up the page has room for the card in
 * view and a pinned bar is clutter. Glass for the surface, cocoa for the ink —
 * the pairing `glass.test.ts` measures — and the bottom padding clears the
 * home indicator on notched phones.
 */

/** The hero is the first `header` directly under `main`. */
function findHero(): Element | null {
  return document.querySelector('main > header');
}

export function StickyCta(): JSX.Element | null {
  const [heroVisible, setHeroVisible] = useState(true);
  const [widgetVisible, setWidgetVisible] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return;

    const observers: IntersectionObserver[] = [];
    let heroSeen = false;
    let widgetSeen = false;

    const watch = (target: Element, report: (visible: boolean) => void) => {
      const observer = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) report(last.isIntersecting);
      });
      observer.observe(target);
      observers.push(observer);
    };

    // The hero is rendered only once the studio's details have arrived, which
    // is after this effect first runs, so the lookup is retried whenever the
    // page's direct children change.
    const attach = () => {
      const hero = findHero();
      if (hero && !heroSeen) {
        heroSeen = true;
        watch(hero, setHeroVisible);
      }
      const widget = document.getElementById('booking-widget');
      if (widget && !widgetSeen) {
        widgetSeen = true;
        watch(widget, setWidgetVisible);
      }
    };

    attach();
    const main = document.getElementById('main');
    const mutations = main ? new MutationObserver(attach) : null;
    if (main && mutations) mutations.observe(main, { childList: true });

    return () => {
      mutations?.disconnect();
      observers.forEach((observer) => observer.disconnect());
    };
  }, []);

  if (heroVisible || widgetVisible) return null;

  return (
    <div
      data-sticky-cta
      className={
        'fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--glass-border)] bg-[var(--glass-bg)] px-4 pt-3 ' +
        'pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[var(--glass-blur)] md:hidden'
      }
    >
      <a
        href="#booking-widget"
        onClick={(event) => {
          event.preventDefault();
          scrollToId('booking-widget');
        }}
        className={
          'text-cocoa border-rose-ink flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--radius-pill)] ' +
          'border-2 text-base font-extrabold focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-current'
        }
      >
        Save a seat
        <span aria-hidden="true">→</span>
      </a>
    </div>
  );
}
