import { apiBaseUrl } from '@/lib/api/base-url';

/**
 * Which side of the app this caller belongs to.
 *
 * The role is a database fact — a `host_user` row or a `guest` row — so it
 * cannot be read from the token, and deliberately is not checked in
 * middleware: a query on every edge request would tax every asset to answer a
 * question that changes approximately never.
 */

/**
 * `unknown` and `unreachable` are not the same answer and must not be merged.
 *
 * `unknown` is the API saying "this identity has no record on either side" —
 * a real, expected state that the claim flow exists to resolve, so it routes
 * somewhere. `unreachable` is not an answer at all, and the only safe response
 * to it is to leave the caller where they are.
 */
export type Role = 'host' | 'guest' | 'unknown' | 'unreachable';

/** Ask the API who this token belongs to. Never throws. */
export async function fetchRole(token: string): Promise<Role> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/v1/portal/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!response.ok) return 'unreachable';

    const { role } = (await response.json()) as { role?: string };

    return role === 'host' || role === 'guest' ? role : 'unknown';
  } catch {
    return 'unreachable';
  }
}
