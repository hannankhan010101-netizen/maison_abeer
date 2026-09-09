import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { isDemoMode } from '@/lib/demo/enabled';
import { AUTH_COOKIE_OPTIONS } from '@/lib/supabase/cookies';

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Route protection.
 *
 * Runs before every portal page. Without it, `/today` renders for anyone —
 * the API would still refuse to return data, but showing a signed-out person
 * the shell of someone's studio is not something to leave to the API.
 *
 * `getUser()` is used rather than `getSession()`: the session is read from a
 * cookie the client can edit, while `getUser()` verifies the token with
 * Supabase. For an authorisation decision, only the verified answer counts.
 */

// Guest-facing pages: `/book` from an ad, `/feedback` from the thank-you
// message, `/enter` from a sign-in link the host sent. None may redirect to a
// login form — the people arriving there either have no account, or have one
// and no password to type into it.
const PUBLIC_PATHS = ['/login', '/auth', '/book', '/feedback', '/enter'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Demo mode has no auth to check. Dev-only and double-gated; a production
  // build folds this to `false` and drops the branch entirely.
  if (isDemoMode()) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Not configured yet. Treat everyone as signed out rather than throwing on
  // every request — a misconfigured deployment should show the login page,
  // not a 500 on every route including /login itself.
  if (!supabaseUrl || !supabaseAnonKey) {
    return isPublic(pathname) ? NextResponse.next() : redirectToLogin(request);
  }

  // Let the response carry any refreshed auth cookies back to the browser.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    // Long-lived by design — see AUTH_COOKIE_OPTIONS. Rewriting the cookie
    // here on every request is what keeps a guest's session from ageing out:
    // each visit resets the 400-day clock.
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Two different failures, deliberately handled differently.
  //
  // Supabase answering "nobody" is an answer: that caller is signed out.
  //
  // Supabase not answering at all is not. A guest has no password to re-enter
  // and no email to click, so bouncing them to the login form over a dropped
  // connection strands them — and it would happen on exactly the flaky café
  // wifi where they are most likely to open the app. When the request throws
  // but the caller is carrying a session cookie, let them through: the API
  // verifies every token itself and returns nothing without one. This
  // middleware decides whether to render a shell, not who gets data.
  let user = null;
  let unreachable = false;

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    unreachable = true;
  }

  if (!user && !isPublic(pathname)) {
    if (!(unreachable && hasSessionCookie(request))) {
      return redirectToLogin(request);
    }
  }

  // A signed-in caller has no reason to see the login form. Sent to `/`
  // rather than `/today`: there are two audiences now, and only the role
  // router knows which home belongs to this token.
  if (user && pathname === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';

    return NextResponse.redirect(home);
  }

  return response;
}

/**
 * Is this caller carrying a Supabase session at all?
 *
 * Only ever used to decide whether an *unreachable* auth service should strand
 * someone. The cookie is not evidence of a valid session — it is client-side
 * and forgeable — which is fine, because the API verifies the token on every
 * request regardless. Nothing is authorised on the strength of this.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith('sb-'));
}

/** Send an unauthenticated request to sign in, remembering where it was going. */
function redirectToLogin(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = '';
  // Validated on the way back out by safeDestination().
  login.searchParams.set('next', `${pathname}${search}`);

  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the favicon. Excluding these keeps
     * an auth round-trip off every image request.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
