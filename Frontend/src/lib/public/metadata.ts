/**
 * What the booking page is called when someone pastes its link — and where
 * the server asks for the studio to find that out.
 *
 * Server-only. `apiBaseUrl()` is the browser's answer (it derives the host
 * from the page in dev and is '' on the server); here there is no page to
 * derive from, so the server reads its own variable first.
 */

import type { PublicClass, PublicClassList, PublicStudio } from './api';
import { fetchClassesServer } from './serverClasses';
import { craftsIn, type CraftKind } from './studioPhotos';

const DESCRIPTION_LIMIT = 160;
const FALLBACK_DESCRIPTION = 'Pick a workshop and save your seat.';

const CRAFT_WORD: Record<CraftKind, string> = {
  pottery: 'pottery',
  cake: 'cake',
  painting: 'painting',
};

export function serverApiBase(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8001';
}

/** The absolute origin link previews resolve the image against. */
export function siteBase(): URL {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) return new URL(site);

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return new URL(`https://${vercel}`);

  return new URL('http://localhost:3000');
}

/**
 * The studio and its classes, or null. Never throws and never waits long.
 * The same request the page makes, so one render shares one cached fetch.
 */
export function fetchStudioForMetadata(slug: string): Promise<PublicClassList | null> {
  return fetchClassesServer(slug);
}

export function storefrontTitle(name: string | null): string {
  return name ? `${name} · book a class` : 'Book a class';
}

function cutStory(story: string): string {
  if (story.length < DESCRIPTION_LIMIT) return story;

  const head = story.slice(0, DESCRIPTION_LIMIT);
  const boundary = head.lastIndexOf(' ');
  const cut = boundary > 0 ? head.slice(0, boundary) : head.slice(0, DESCRIPTION_LIMIT - 1);

  return cut.replace(/[\s,;:.—–-]+$/u, '');
}

function joinCrafts(crafts: CraftKind[]): string {
  const words = crafts.map((craft) => CRAFT_WORD[craft]);
  const last = words.pop() ?? '';
  const phrase = words.length > 0 ? `${words.join(', ')} and ${last}` : last;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export function storefrontDescription(studio: PublicStudio | null, classes: PublicClass[]): string {
  const story = studio?.story?.trim().replace(/\s+/g, ' ');
  if (story) return cutStory(story);

  const crafts = craftsIn(classes.map((item) => item.color_token));
  if (crafts.length > 0) {
    return `${joinCrafts(crafts)} classes — pick one and we'll keep you a seat`;
  }

  return FALLBACK_DESCRIPTION;
}

/** A count, never a date: the server's clock is not the guest's. */
export function seatsBlurb(classes: PublicClass[]): string | null {
  const next = classes
    // The same rule as the page's own seats line: a class the host marked full has
    // no open seats, whatever its count still says.
    .filter((item) => item.seats_left > 0 && !item.is_full)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];

  if (!next) return null;
  if (next.seats_left === 1) return 'last seat in the next class';
  return `${next.seats_left} seats left in the next class`;
}
