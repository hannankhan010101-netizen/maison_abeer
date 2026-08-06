/**
 * Development-only demo mode.
 *
 * Lets the app be used end to end without a Supabase project or a database:
 * auth is skipped and the API is answered from fixtures.
 *
 * This bypasses authentication, so it is deliberately hard to switch on:
 *
 *   1. `NODE_ENV` must not be production. Next sets this for `next build`
 *      and `next start`, so a production bundle cannot enable it at all —
 *      the check folds to `false` at build time and the branch is dropped.
 *   2. `NEXT_PUBLIC_DEMO_MODE` must be exactly "1", so it cannot be turned on
 *      by a stray truthy value.
 *
 * Both conditions are required. A build that satisfies neither behaves
 * exactly as it does today.
 */

export const DEMO_FLAG = 'NEXT_PUBLIC_DEMO_MODE';

export function isDemoMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.NEXT_PUBLIC_DEMO_MODE === '1';
}

/**
 * Whether demo mode *could* be enabled in this environment.
 *
 * Used by the banner and by tests; kept separate from `isDemoMode` so the
 * production guard can be asserted independently of the flag.
 */
export function demoModeIsPermitted(): boolean {
  return process.env.NODE_ENV !== 'production';
}
