'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { EnterFailed, EnterWaiting } from '@/components/public/doors/EnterStates';

/**
 * Sign in from a link the host sent.
 *
 * The recovery path, not the normal one. Guests get into their portal from
 * the booking confirmation and then stay signed in; this exists for the case
 * that breaks — cleared browser data, or a new phone — where the credential
 * lived on the old device and there is no password or verified email to fall
 * back on.
 *
 * Deliberately outside the `(guest)` route group. Everything in there renders
 * `GuestShell`, which assumes a signed-in guest, and the whole point of this
 * page is to be reachable by someone who is not one yet. It is in
 * `PUBLIC_PATHS` for the same reason: middleware would otherwise send them to
 * a login form they have no password for.
 *
 * The token arrives in the URL because the host has to be able to send it.
 * That is the ordinary magic-link trade, and unlike the booking handoff this
 * one really is a link that anyone holding can spend. It is single-use and
 * short-lived, and it is stripped from history below so it does not linger in
 * the back button or travel with a screenshot of the address bar.
 */
export default function EnterPage() {
  return (
    <Suspense fallback={<EnterWaiting />}>
      <Enter />
    </Suspense>
  );
}

function Enter() {
  const params = useSearchParams();

  // 'spent' is the overwhelmingly likely failure and gets copy that says so.
  // 'broken' covers everything else — a dropped connection, Supabase down —
  // where telling someone their link is used up would send them to ask for a
  // replacement that fails in exactly the same way.
  const [failed, setFailed] = useState<null | 'spent' | 'broken'>(null);

  /**
   * Redeem exactly once, ever.
   *
   * The token is single-use, so a second attempt is not a harmless retry — it
   * is guaranteed to fail, and it reports the link as spent when the first
   * attempt is what spent it. React StrictMode runs effects twice in
   * development and does precisely this: the first call signs the guest in,
   * the cleanup cancels its navigation, and the second call renders "that
   * link has already been used" over a perfectly good session.
   *
   * A ref rather than state — it must not reset on a re-render, and changing
   * it must not cause one.
   */
  const attempted = useRef(false);

  const token = params.get('token');
  const type = params.get('type') === 'signup' ? 'signup' : 'magiclink';

  useEffect(() => {
    if (!token) {
      setFailed('spent');
      return;
    }

    if (attempted.current) return;
    attempted.current = true;

    async function enter() {
      // Out of the address bar before anything touches the network.
      window.history.replaceState(null, '', '/enter');

      try {
        const { redeemPortalToken } = await import('@/lib/supabase/client');

        if (await redeemPortalToken(token!, type)) {
          // A hard navigation: the session was just written to a cookie that
          // server-rendered middleware needs to read.
          //
          // Deliberately not guarded by a `cancelled` flag. Once the token is
          // spent this navigation is the only thing that can still help the
          // guest, so an unmount must not be able to swallow it.
          window.location.assign('/portal');
          return;
        }

        setFailed('spent');
      } catch {
        // Never reached the auth service at all, so the link may well still
        // be good.
        setFailed('broken');
      }
    }

    void enter();
  }, [token, type]);

  if (failed === null) return <EnterWaiting />;

  return <EnterFailed kind={failed} />;
}
