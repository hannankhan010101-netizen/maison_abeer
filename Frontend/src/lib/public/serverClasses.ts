/**
 * The schedule, asked for once on the server.
 *
 * Server-only. The page and its metadata both call this with the same URL and
 * options, so Next dedupes them into one request per render and caches the
 * answer for 15 s — the same window the API's own `Cache-Control` allows.
 *
 * It never throws and never waits long: on a slow (over 1.2 s), failed or
 * non-2xx answer it returns null and the page falls back to the browser fetch.
 */

import type { PublicClassList } from './api';
import { serverApiBase } from './metadata';

const TIMEOUT_MS = 1200;
const REVALIDATE_S = 15;

export async function fetchClassesServer(slug: string): Promise<PublicClassList | null> {
  try {
    const base = serverApiBase().replace(/\/+$/, '');
    const response = await fetch(`${base}/api/v1/public/${encodeURIComponent(slug)}/classes`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE_S },
    } as RequestInit);
    if (!response.ok) return null;
    return (await response.json()) as PublicClassList;
  } catch {
    return null;
  }
}
