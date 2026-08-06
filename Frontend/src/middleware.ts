import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

const PUBLIC_PATHS = ['/login', '/auth'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
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
    },
  );

  // A failed auth check means "we cannot prove who this is", which is the
  // same decision as signed out. Supabase being unreachable must not take
  // the whole app down with a 500.
  let user = null;

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  if (!user && !isPublic(pathname)) {
    return redirectToLogin(request);
  }

  // A signed-in host has no reason to see the login form.
  if (user && pathname === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/today';
    home.search = '';

    return NextResponse.redirect(home);
  }

  return response;
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
