import { expect, type Page } from '@playwright/test';

import { COMMON_FAQ, CRAFT_GUIDES } from '../../src/lib/public/craftGuide';
import { QUIZ } from '../../src/lib/public/quiz';
import { instagramDmUrl, instagramUrl } from '../../src/lib/public/instagram';
import { mapsUrl } from '../../src/lib/public/maps';

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
  /** The ARIA role to look it up by, when it is not a plain button or link (the corner's tabs). */
  role?: 'tab';
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

/** Names built from the craft guide itself, so a new tool or question is covered the moment it exists. */
const TOOL_NAMES = Object.values(CRAFT_GUIDES).flatMap((guide) =>
  guide.tools.map((tool) => tool.name),
);
const QUESTIONS = [...COMMON_FAQ, ...Object.values(CRAFT_GUIDES).flatMap((guide) => guide.faq)].map(
  (entry) => entry.q,
);
const anyOf = (names: readonly string[]) => new RegExp(`^(${names.map(escape).join('|')})$`);

/** Every answer label across the quiz's questions, so a new question or answer is covered at once. */
const QUIZ_ANSWERS = QUIZ.flatMap((question) => question.answers.map((answer) => answer.label));

/** Completes the quiz with the first answer on every question, so its result controls come up. */
async function finishQuiz(page: Page) {
  const quiz = page.locator('section.quiz');
  if ((await quiz.count()) === 0) return;

  for (let i = 0; i < QUIZ.length; i += 1) {
    const button = quiz.getByRole('button', { name: QUIZ[i]!.answers[0]!.label });
    if (await button.count()) await button.first().click();
  }
}

/** Answers the first question only, so the Back button comes up without finishing the quiz. */
async function startQuiz(page: Page) {
  const quiz = page.locator('section.quiz');
  if ((await quiz.count()) === 0) return;

  const button = quiz.getByRole('button', { name: QUIZ[0]!.answers[0]!.label });
  if (await button.count()) await button.first().click();
}

/** After a tap on a disclosure button (a tool, a question) something in the corner is open. */
async function cornerHasOpen(page: Page) {
  await expect(page.locator('section.corner [aria-expanded="true"]').first()).toBeVisible();
}

/**
 * The pill shows once the hero has gone and while the booking card and the
 * footer are off screen. The card now sits right under the hero, so the place
 * the pill appears is just below the card (as e2e/atmosphere.spec.ts finds it).
 */
async function midPage(page: Page) {
  await expect
    .poll(async () => {
      await page.evaluate(() => {
        const widget = document.querySelector('#booking-widget');
        const bottom = (widget?.getBoundingClientRect().bottom ?? 0) + window.scrollY;
        window.scrollTo(0, bottom + 200);
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

  // The characters in the hero: a tap pops a craft fact.
  {
    page: BOOK,
    name: /^(Bento|Pip|Dot), tap for a (cake|clay|painting) fact$/,
    kind: 'button',
    within: 'main > header',
    outcome: async (page) => {
      await expect(page.locator('.character-speech[data-open]').first()).toBeVisible();
    },
  },

  // The pop-up cards: a craft filter (only with two or more crafts) and a Maps link on each card.
  {
    page: BOOK,
    name: /^(All|Cake|Pottery|Painting)$/,
    kind: 'toggle',
    within: '[role="group"][aria-label="Filter by craft"]',
  },
  {
    page: BOOK,
    name: /Maps\s*: .+, opens in a new tab$/,
    kind: 'external',
    within: '#booking-widget',
    // The stub's classes are all at "Studio A".
    href: () => mapsUrl('Studio A'),
  },

  // The craft corner: tabs per craft, tools, another fun fact and the questions.
  {
    page: BOOK,
    name: /^(Bento cakes|Pottery|Painting)$/,
    kind: 'button',
    role: 'tab',
    within: 'section.corner',
    outcome: async (page) => {
      await expect(page.locator('section.corner [role="tab"][aria-selected="true"]')).toHaveCount(
        1,
      );
    },
  },
  {
    page: BOOK,
    name: anyOf(TOOL_NAMES),
    kind: 'button',
    within: 'section.corner',
    outcome: cornerHasOpen,
  },
  {
    page: BOOK,
    name: /^Another fun fact$/,
    kind: 'button',
    within: 'section.corner',
    outcome: async (page) => {
      await expect(page.locator('section.corner [aria-live="polite"]').first()).toBeVisible();
    },
  },
  {
    page: BOOK,
    name: anyOf(QUESTIONS),
    kind: 'button',
    within: 'section.corner',
    outcome: cornerHasOpen,
  },

  // The quiz: each answer moves on; the result offers to book, share or start again.
  {
    page: BOOK,
    name: anyOf(QUIZ_ANSWERS),
    kind: 'button',
    within: 'section.quiz',
    outcome: async (page) => {
      // The first answer has no Back button yet; any later one does.
      const moved = page.locator('section.quiz [role="progressbar"], section.quiz h3');
      await expect(moved.first()).toBeVisible();
    },
  },
  {
    page: BOOK,
    name: /^Back$/,
    kind: 'button',
    within: 'section.quiz',
    reveal: startQuiz,
    outcome: async (page) => {
      await expect(page.locator('section.quiz [role="progressbar"]')).toBeVisible();
    },
  },
  {
    page: BOOK,
    name: /^Book this one$/,
    kind: 'button',
    within: 'section.quiz',
    reveal: finishQuiz,
    outcome: async (page) => {
      await expect(page.locator('#booking-widget')).toBeInViewport();
    },
  },
  {
    page: BOOK,
    name: /^Share to Story$/,
    kind: 'button',
    within: 'section.quiz',
    reveal: finishQuiz,
    outcome: async (page) => {
      await expect(
        page.getByText(/Saved to your photos or downloads|would not save/i),
      ).toBeVisible();
    },
  },
  {
    page: BOOK,
    name: /^Start again$/,
    kind: 'button',
    within: 'section.quiz',
    reveal: finishQuiz,
    outcome: async (page) => {
      await expect(page.locator('section.quiz [role="progressbar"]')).toHaveAttribute(
        'aria-valuenow',
        '1',
      );
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
