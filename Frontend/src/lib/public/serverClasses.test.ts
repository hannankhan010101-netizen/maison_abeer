import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PublicClassList } from './api';
import { fetchStudioForMetadata } from './metadata';
import { fetchClassesServer } from './serverClasses';

const body: PublicClassList = {
  studio: {
    name: 'Maison Abeer',
    instagram_handle: null,
    logo_url: null,
    primary_color: null,
    accent_color: null,
    hero_photo_url: null,
    story: null,
  },
  classes: [],
};

type Init = RequestInit & { next?: { revalidate?: number } };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchClassesServer', () => {
  it('returns the parsed list on a 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(fetchClassesServer('maison-abeer')).resolves.toEqual(body);
  });

  it('asks the server API base with a timeout signal and a 15 s revalidate', async () => {
    vi.stubEnv('API_URL', 'https://api.example/');
    const fetchMock = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal('fetch', fetchMock);

    await fetchClassesServer('maison abeer');

    const [url, init] = fetchMock.mock.calls[0] as [string, Init];
    expect(url).toBe('https://api.example/api/v1/public/maison%20abeer/classes');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.next?.revalidate).toBe(15);
  });

  it('returns null on a rejected fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(fetchClassesServer('x')).resolves.toBeNull();
  });

  it.each([500, 404])('returns null on a %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status })));
    await expect(fetchClassesServer('x')).resolves.toBeNull();
  });

  it('returns null when the request times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError')),
    );
    await expect(fetchClassesServer('x')).resolves.toBeNull();
  });

  it('gives up after 1.2 s', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await fetchClassesServer('x');
    expect(timeout).toHaveBeenCalledWith(1200);
  });
});

describe('fetchStudioForMetadata', () => {
  it('delegates to fetchClassesServer: one fetch, the very same request as the page', async () => {
    vi.stubEnv('API_URL', 'https://api.example');
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json(body)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchStudioForMetadata('maison-abeer')).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await fetchClassesServer('maison-abeer');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Next dedupes and caches fetches by URL and options, so identical calls
    // from generateMetadata and the page are one request per render.
    const [first, second] = fetchMock.mock.calls as [string, Init][];
    expect(first?.[0]).toBe(second?.[0]);
    expect(first?.[1].next).toEqual(second?.[1].next);
    expect(first?.[1].next).toEqual({ revalidate: 15 });
  });
});
