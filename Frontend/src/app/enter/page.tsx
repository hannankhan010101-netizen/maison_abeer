'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Card } from '@/components/ui/Card';

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
    <Suspense fallback={<Waiting />}>
      <Enter />
    </Suspense>
  );
}

function Waiting() {
  return (
    <main id="main" className="grid min-h-[70vh] place-items-center px-4">
      <p role="status" aria-live="polite" className="text-latte">
        <span className="sr-only">Signing you in</span>
        <span aria-hidden="true">…</span>
      </p>
    </main>
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

  if (failed === null) return <Waiting />;

  return (
    <main id="main" className="grid min-h-[70vh] place-items-center px-4">
      <Card className="max-w-[38ch] text-center">
        <p className="text-4xl" aria-hidden="true">
          🌷
        </p>

        {failed === 'spent' ? (
          <>
            <p role="alert" className="font-display mt-2 text-xl">
              That link has already been used
            </p>
            <p className="text-latte mt-2 text-sm">
              They only work once, and not for long. Ask your studio for a fresh one and
              you&rsquo;ll be straight back in.
            </p>
          </>
        ) : (
          <>
            <p role="alert" className="font-display mt-2 text-xl">
              We couldn&rsquo;t sign you in just now
            </p>
            <p className="text-latte mt-2 text-sm">
              Something went wrong on our side, not yours — your link may still work. Check your
              connection and try it again.
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
