/**
 * How long an auth session lives.
 *
 * Its own module so the middleware can read it without importing the browser
 * client — the middleware runs on the edge runtime, and pulling a module that
 * constructs a browser Supabase client into that bundle is a needless way to
 * find out which APIs the edge does not have.
 *
 * A guest is never signed out. They have no password to re-enter and no email
 * to click, so being logged out means losing the app entirely. The cookies get
 * the longest life a browser will honour, and `middleware.ts` rewrites them on
 * every request, restarting the clock on each visit.
 *
 * 400 days is the hard cap Chrome applies to any cookie. Asking for longer
 * does not get longer, it gets silently clamped — so the honest guarantee is
 * that a guest who opens the app once every 400 days stays signed in forever.
 *
 * Both clients must pass exactly this. Cookies written with different
 * attributes are different cookies, and the two would fight over the session.
 */
export const AUTH_COOKIE_OPTIONS = {
  maxAge: 400 * 24 * 60 * 60,
  path: '/',
  sameSite: 'lax',
} as const;
