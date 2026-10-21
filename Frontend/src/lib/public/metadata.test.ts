import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PublicClass, PublicStudio } from './api';
import {
  fetchStudioForMetadata,
  seatsBlurb,
  serverApiBase,
  siteBase,
  storefrontDescription,
  storefrontTitle,
} from './metadata';

const studio = (story: string | null): PublicStudio => ({
  name: 'Maison Abeer',
  instagram_handle: null,
  logo_url: null,
  primary_color: null,
  accent_color: null,
  hero_photo_url: null,
  story,
});

const klass = (color_token: string, starts_at: string, seats_left: number): PublicClass => ({
  id: `${color_token}-${starts_at}`,
  name: 'A class',
  starts_at,
  ends_at: starts_at,
  location: null,
  color_token,
  photo_url: null,
  seats_left,
  is_full: seats_left === 0,
  waitlist_is_open: false,
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('serverApiBase', () => {
  it('prefers API_URL, then NEXT_PUBLIC_API_URL, then local dev', () => {
    vi.stubEnv('API_URL', 'https://internal.example');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://public.example');
    expect(serverApiBase()).toBe('https://internal.example');

    vi.stubEnv('API_URL', undefined);
    expect(serverApiBase()).toBe('https://public.example');

    vi.stubEnv('NEXT_PUBLIC_API_URL', undefined);
    expect(serverApiBase()).toBe('http://127.0.0.1:8001');
  });
});

describe('siteBase', () => {
  it('prefers NEXT_PUBLIC_SITE_URL, then the Vercel production host, then localhost', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://maison.example');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'maison.vercel.app');
    expect(siteBase().href).toBe('https://maison.example/');

    vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined);
    expect(siteBase().href).toBe('https://maison.vercel.app/');

    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', undefined);
    expect(siteBase().href).toBe('http://localhost:3000/');
  });
});

describe('storefrontTitle', () => {
  it('names the studio when it can', () => {
    expect(storefrontTitle('Maison Abeer')).toBe('Maison Abeer · book a class');
    expect(storefrontTitle(null)).toBe('Book a class');
  });
});

describe('storefrontDescription', () => {
  it('cuts a long story under 160 chars at a word boundary, with no dangling comma', () => {
    const story = 'We throw pots, bake cakes, and paint, together, '.repeat(7).slice(0, 320);
    expect(story).toHaveLength(320);

    const description = storefrontDescription(studio(story), []);

    expect(description.length).toBeLessThan(160);
    expect(story.startsWith(description)).toBe(true);
    expect(story[description.length]).toMatch(/[\s,.;:]/);
    expect(description).not.toMatch(/[,;:.\s]$/);
  });

  it('keeps a short story whole', () => {
    expect(storefrontDescription(studio('Clay and cake in Lahore.'), [])).toBe(
      'Clay and cake in Lahore.',
    );
  });

  it('names the crafts in first-seen order when there is no story', () => {
    const at = '2026-11-01T10:00:00Z';
    expect(storefrontDescription(studio(null), [klass('terra', at, 3)])).toBe(
      "Pottery classes — pick one and we'll keep you a seat",
    );
    expect(
      storefrontDescription(studio(''), [
        klass('terra', at, 3),
        klass('pink', at, 3),
        klass('terra', at, 1),
      ]),
    ).toBe("Pottery and cake classes — pick one and we'll keep you a seat");
    expect(
      storefrontDescription(null, [
        klass('terra', at, 3),
        klass('pink', at, 3),
        klass('sage', at, 3),
      ]),
    ).toBe("Pottery, cake and painting classes — pick one and we'll keep you a seat");
  });

  it('falls back to the plain line', () => {
    expect(storefrontDescription(null, [])).toBe('Pick a workshop and save your seat.');
  });
});

describe('seatsBlurb', () => {
  it('counts the seats of the soonest class that has any', () => {
    expect(
      seatsBlurb([
        klass('terra', '2026-11-03T10:00:00Z', 2),
        klass('pink', '2026-11-01T10:00:00Z', 0),
        klass('sage', '2026-11-02T10:00:00Z', 8),
      ]),
    ).toBe('8 seats left in the next class');
    expect(seatsBlurb([klass('terra', '2026-11-03T10:00:00Z', 1)])).toBe(
      'last seat in the next class',
    );
    expect(seatsBlurb([klass('terra', '2026-11-03T10:00:00Z', 0)])).toBeNull();
    expect(seatsBlurb([])).toBeNull();
  });

  it('ignores a class the host has marked full, even if seats_left still says otherwise', () => {
    // The page's own seats line (bookingCopy.seatsLine) excludes is_full classes;
    // the share card must not promise seats the page will not show.
    const full = { ...klass('terra', '2026-11-03T10:00:00Z', 2), is_full: true };
    expect(seatsBlurb([full])).toBeNull();
    expect(seatsBlurb([full, klass('sage', '2026-11-05T10:00:00Z', 3)])).toBe(
      '3 seats left in the next class',
    );
  });
});

describe('fetchStudioForMetadata', () => {
  it('returns null when the fetch rejects, and passes a timeout signal', async () => {
    vi.stubEnv('API_URL', 'https://api.example');
    const fetchMock = vi.fn().mockRejectedValue(new Error('down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchStudioForMetadata('maison abeer')).resolves.toBeNull();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { next?: unknown }];
    expect(url).toBe('https://api.example/api/v1/public/maison%20abeer/classes');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.next).toEqual({ revalidate: 15 });
  });

  it('returns null on a non-2xx and the body on a 2xx', async () => {
    const body = { studio: studio(null), classes: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
    await expect(fetchStudioForMetadata('x')).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(fetchStudioForMetadata('x')).resolves.toEqual(body);
  });
});
