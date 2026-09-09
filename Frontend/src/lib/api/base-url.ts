/**
 * Where the API lives, from the browser's point of view.
 *
 * `NEXT_PUBLIC_API_URL` wins when it is set — production points at a real
 * hostname and must not guess.
 *
 * In development it is deliberately *not* set, and the host is taken from
 * whatever address the page itself was opened on. That is the difference
 * between an app you can open on your phone and one you cannot:
 *
 * - `localhost:3000` on the laptop asks `localhost:8001` — right.
 * - `10.10.10.46:3000` from a phone asks `10.10.10.46:8001` — also right.
 *
 * A hardcoded LAN address is correct until the router hands out a different
 * one, and then every screen fails to load with no clue why. That has already
 * happened once here: the machine moved from `192.168.100.125` to
 * `10.10.10.46` between one session and the next, and nothing worked on any
 * device until the value was edited by hand.
 *
 * Server-side rendering has no `window`; it also makes no API calls, because
 * every fetch in this app happens from the browser with the guest's token.
 * The empty string is the honest answer there rather than a wrong guess.
 */

/** The port the FastAPI app listens on in development. */
const DEV_API_PORT = '8001';

export function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;

  if (configured) return configured.replace(/\/+$/, '');

  if (typeof window === 'undefined') return '';

  return `${window.location.protocol}//${window.location.hostname}:${DEV_API_PORT}`;
}
