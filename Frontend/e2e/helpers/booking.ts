import type { Page } from '@playwright/test';

/**
 * Stand-in for the public booking API, shared by the specs that load
 * `/book/maison-abeer`.
 *
 * The page talks to the API directly from the browser, so a spec cannot lean on
 * demo mode; it intercepts the network instead. Dates are relative to now so a
 * class is always upcoming.
 */

export interface StubClass {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  color_token: string;
  seats_left: number;
  is_full: boolean;
  waitlist_is_open: boolean;
}

const DAY = 86_400_000;

/** One pink class, tomorrow. Override anything. */
export function stubClass(overrides: Partial<StubClass> = {}): StubClass {
  return {
    id: 'class-1',
    name: 'Bento cake decorating',
    starts_at: new Date(Date.now() + DAY).toISOString(),
    ends_at: new Date(Date.now() + DAY + 9_000_000).toISOString(),
    location: 'Studio A',
    color_token: 'pink',
    seats_left: 4,
    is_full: false,
    waitlist_is_open: false,
    ...overrides,
  };
}

/** One class in each craft the storefront has photographs and chapters for. */
export function threeCrafts(): StubClass[] {
  return [
    stubClass({ id: 'class-1', name: 'Bento cake decorating', color_token: 'pink' }),
    stubClass({
      id: 'class-2',
      name: 'Pottery & wheel throwing',
      color_token: 'terra',
      seats_left: 8,
    }),
    stubClass({ id: 'class-3', name: 'Ceramic painting', color_token: 'sage', seats_left: 2 }),
  ];
}

export async function stubBookingApi(page: Page, classes: StubClass[] = [stubClass()]) {
  await page.route('**/api/v1/public/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        studio: { name: 'Maison Abeer', instagram_handle: 'maisonabeer' },
        classes,
      }),
    }),
  );
}
