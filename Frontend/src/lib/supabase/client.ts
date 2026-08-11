import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client.
 *
 * Used for authentication only. Application data never travels this path —
 * it goes through the FastAPI gateway so business rules live in one place
 * (see docs/adr/0001-architecture.md).
 *
 * The anon key is safe in the browser by design: it is RLS-constrained and
 * grants nothing on its own.
 */

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

/*
 * Read as static literals, never `process.env[name]`.
 *
 * Next inlines `NEXT_PUBLIC_*` at build time by substituting the literal
 * expression. A dynamic key cannot be statically analysed, so it is left
 * alone — and in the browser `process.env` is an empty object, so every
 * lookup returns undefined however well the variable is configured.
 *
 * This is invisible in tests, which run in Node where `process.env` is real.
 * Only a browser shows it.
 */
const PUBLIC_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
} as const;

function readEnv(name: keyof typeof PUBLIC_ENV): string {
  const value = PUBLIC_ENV[name];

  if (!value) {
    // Failing loudly beats a login screen that silently never works.
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill in your Supabase values.`,
    );
  }

  return value;
}

/** Memoised so a single auth session is shared across the app. */
export function getSupabaseBrowserClient() {
  browserClient ??= createBrowserClient(
    readEnv('NEXT_PUBLIC_SUPABASE_URL'),
    readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  );

  return browserClient;
}

/** Test seam — drops the memoised client. */
export function resetSupabaseBrowserClient(): void {
  browserClient = undefined;
}

/**
 * The current access token, or null when signed out.
 *
 * Supabase refreshes an expiring token inside `getSession`, so reading it
 * per-request is what keeps a long studio session from failing mid-afternoon.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session?.access_token ?? null;
}
