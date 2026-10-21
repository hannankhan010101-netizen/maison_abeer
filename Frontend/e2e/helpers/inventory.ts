import { expect, type Page } from '@playwright/test';

import { instagramDmUrl, instagramUrl } from '../../src/lib/public/instagram';

/**
 * Every tappable thing on the public pages, and what tapping it must do.
 *
 * `e2e/tap-everything.spec.ts` walks the page at 375 px and 1440 px, collects
 * every visible `a`, `button`, `[role="button"]` and `summary`, and fails on
 * any that no entry here describes. So a new control cannot ship without
 * someone writing down what it is for, and a control that stops doing that
 * thing fails its own check.
 */

/** The handle the spec's stub API returns. Links are built from it, never typed twice. */
export const STUDIO_HANDLE = 'maison._abeer';

export type Kind = 'anchor' | 'external' | 'button' | 'toggle';
export type Viewport = 'mobile' | 'desktop';

export interface InventoryEntry {
  page: string;
  /** Matched against the element's accessible name. */
  name: RegExp;
  kind: Kind;
  /** Only where the element is (a CSS selector the element sits inside). */
  within?: string;
  /** The projects the element is on; both when absent. */
  viewports?: readonly Viewport[];
  /** anchor: the id it scrolls to. */
  target?: string;
  /** external: the URL, built from the studio's handle. */
  href?: (handle: string) => string | null;
  /** button: what must be true after a tap. */
  outcome?: (page: Page) => Promise<void>;
  /** Brings the element on screen first (the floating pill only shows mid-page). */
  reveal?: (page: Page) => Promise<void>;
  /**
   * A known problem the guard found and this unit may not fix (V0 makes no
   * component changes). The check records it as an annotation instead of
   * failing; the fix removes this line.
   */
  knownIssue?: string;
}

const BOOK = '/book/maison-abeer';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The pill shows once the hero has gone and while the card and footer are off screen. */
async function midPage(page: Page) {
  // As e2e/atmosphere.spec.ts does: just past the hero, retried while the page settles.
  await expect
    .poll(async () => {
      await page.evaluate(() => {
        const hero = document.querySelector('main > header');
        const bottom = (hero?.getBoundingClientRect().bottom ?? 0) + window.scrollY;
        window.scrollTo(0, Math.max(window.innerHeight, bottom + 120));
      });
      await page.waitForTimeout(300);
      return page.locator('[data-floating-pill]').count();
    })
    .toBe(1);
  await expect(page.locator('[data-floating-pill]')).toBeVisible();
}

export const INVENTORY: readonly InventoryEntry[] = [
  // The root layout's skip link: hidden until focused.
  { page: BOOK, name: /^Skip to content$/, kind: 'anchor', target: 'main' },

  // The hero.
  {
    page: BOOK,
    name: /^Explore classes/,
    kind: 'anchor',
    within: 'main > header',
    target: 'booking-widget',
  },
  {
    page: BOOK,
    name: /^How it works/,
    kind: 'anchor',
    within: 'main > header',
    target: 'how-it-works',
  },
  {
    page: BOOK,
    name: new RegExp(`^Find us on Instagram @${escape(STUDIO_HANDLE)}$`),
    kind: 'external',
    within: 'main > header',
    href: instagramUrl,
  },

  // The floating pill, and every other "Save a seat" (the craft chapters, the footer).
  {
    page: BOOK,
    name: /^Save a seat/,
    kind: 'anchor',
    within: '[data-floating-pill]',
    target: 'booking-widget',
    reveal: midPage,
  },
  { page: BOOK, name: /^Save a seat/, kind: 'anchor', target: 'booking-widget' },

  // The memory wall: the craft filter, each photo, and its keep-heart.
  {
    page: BOOK,
    name: /^(All|Cake|Pottery|Painting)$/,
    kind: 'toggle',
    within: '.memory-chips',
  },
  {
    page: BOOK,
    name: /^Keep “.+”$/,
    kind: 'toggle',
    within: '.memory-tile',
  },
  {
    page: BOOK,
    name: /^(?!Keep “).+/,
    kind: 'button',
    within: '.memory-tile',
    outcome: async (page) => {
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },

  // The class rows in the booking card: a tap moves to the details step.
  {
    page: BOOK,
    name: /(seats? left|fully booked)/,
    kind: 'button',
    within: '#booking-widget',
    outcome: async (page) => {
      await expect(page.getByLabel(/Your name/)).toBeVisible();
    },
  },

  // The footer.
  {
    page: BOOK,
    name: /^(Bento cake decorating|Pottery & wheel throwing|Ceramic painting)$/,
    kind: 'anchor',
    within: 'footer',
    target: 'booking-widget',
  },
  {
    page: BOOK,
    name: new RegExp(`^@${escape(STUDIO_HANDLE)}$`),
    kind: 'external',
    within: 'footer',
    href: instagramUrl,
  },
  { page: BOOK, name: /^Message us$/, kind: 'external', within: 'footer', href: instagramDmUrl },
  {
    page: BOOK,
    name: /^craft photography via Unsplash$/,
    kind: 'external',
    within: 'footer',
    href: () => 'https://unsplash.com/license',
  },
];
