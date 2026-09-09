'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, HandNote } from '@/components/ui/Card';
import { safeDestination } from '@/lib/auth/redirect';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Sign in.
 *
 * The one screen that talks to Supabase directly. Everything after this goes
 * through the API gateway.
 */

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * Sign-in needs JavaScript, so the button waits for it.
   *
   * Server-rendered HTML arrives with a working-looking form before the
   * handler exists. Tapping it then does a native submit — which on a slow
   * phone is a real thing to do, and lands the password somewhere it should
   * never be. Disabled until mounted, the tap simply does nothing.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // One message for every failure. Distinguishing "no such account"
        // from "wrong password" tells an attacker which emails are real.
        setError("That email and password don't match. Want to try again?");
        return;
      }

      // Only same-origin paths, so a crafted ?next= cannot bounce the host
      // to another site immediately after they authenticate.
      router.replace(safeDestination(searchParams.get('next')));
      router.refresh();
    } catch (caught) {
      // A misconfigured client throws before any request is made, and
      // reporting that as a connection problem sends whoever is debugging it
      // to the wrong place entirely. Keep the reassuring copy for the host,
      // put the real cause in the console for whoever is fixing it.
      console.error('[login] sign-in failed before reaching Supabase:', caught);
      setError("We couldn't reach the studio. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-[420px]">
      <h1 className="font-display text-2xl">Welcome back ✨</h1>
      <p className="text-latte mt-1 mb-5">
        <HandNote>Let&rsquo;s get you into the studio</HandNote>
      </p>

      {/*
        `method="post"` matters even though the submit is handled in JS.
        Until this component hydrates there is no `onSubmit`, so tapping the
        button falls back to a native submit — and a form with no method
        submits GET, which writes the typed password into the address bar,
        the browser history and any proxy log on the way. A POST cannot be
        put in a URL. The disabled button below makes that path unreachable
        in the first place; this is the belt to its braces.
      */}
      <form onSubmit={handleSubmit} method="post" noValidate>
        <div className="mb-3.5">
          <label
            htmlFor="email"
            className="text-latte mb-1.5 block text-xs font-extrabold tracking-[0.06em] uppercase"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-line bg-buttercream text-cocoa min-h-[44px] w-full rounded-[var(--radius-sm)] border-[1.5px] px-3.5"
          />
        </div>

        <div className="mb-3.5">
          <label
            htmlFor="password"
            className="text-latte mb-1.5 block text-xs font-extrabold tracking-[0.06em] uppercase"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-line bg-buttercream text-cocoa min-h-[44px] w-full rounded-[var(--radius-sm)] border-[1.5px] px-3.5"
          />
        </div>

        {error ? (
          // role=alert so the failure is announced, not just recoloured.
          <p
            role="alert"
            className="border-danger-line bg-danger-soft text-danger mb-3 rounded-[var(--radius-sm)] border-[1.5px] px-3 py-2 text-sm font-bold"
          >
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={!ready}
          loading={pending}
          loadingLabel="Signing you in…"
          className="w-full"
        >
          Sign in
        </Button>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center p-4">
      {/* useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
