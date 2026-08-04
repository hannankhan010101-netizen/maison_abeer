'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

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
    } catch {
      setError("We couldn't reach the studio. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-[420px]">
      <h1 className="font-display text-2xl">welcome back ✨</h1>
      <p className="text-latte mt-1 mb-5">
        <HandNote>let&rsquo;s get you into the studio</HandNote>
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-3.5">
          <label
            htmlFor="email"
            className="text-latte mb-1.5 block text-xs font-extrabold tracking-[0.06em] uppercase"
          >
            email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-line bg-buttercream text-cocoa min-h-[44px] w-full rounded-[var(--radius-sm)] border-[1.5px] px-3.5 text-sm"
          />
        </div>

        <div className="mb-3.5">
          <label
            htmlFor="password"
            className="text-latte mb-1.5 block text-xs font-extrabold tracking-[0.06em] uppercase"
          >
            password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-line bg-buttercream text-cocoa min-h-[44px] w-full rounded-[var(--radius-sm)] border-[1.5px] px-3.5 text-sm"
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

        <Button type="submit" loading={pending} loadingLabel="signing you in…" className="w-full">
          sign in
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
