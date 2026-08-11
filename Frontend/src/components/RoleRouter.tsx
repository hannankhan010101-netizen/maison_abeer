'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getAccessToken } from '@/lib/supabase/client';

/**
 * Sends a signed-in caller to their side of the app.
 *
 * Hosts get `/today`, guests get `/portal`. An authenticated identity with no
 * record yet — someone who followed a magic link but whose email does not
 * match a booking — lands on `/portal`, because the claim flow there is what
 * explains the situation to them. Sending them to the host dashboard would
 * produce a wall of 401s and no explanation at all.
 *
 * Kept out of middleware deliberately: the role is a database fact, and a
 * query on every edge request would tax every asset for one redirect.
 */

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
}

export function RoleRouter() {
  const router = useRouter();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function route() {
      const token = await getAccessToken();

      if (!token) {
        router.replace('/login');
        return;
      }

      try {
        const response = await fetch(`${apiBase()}/api/v1/portal/whoami`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        if (!response.ok) throw new Error(String(response.status));

        const { role } = (await response.json()) as { role: string };
        if (cancelled) return;

        router.replace(role === 'host' ? '/today' : '/portal');
      } catch {
        // The API being unreachable must not strand someone on a blank page
        // with no way forward.
        if (!cancelled) setStuck(true);
      }
    }

    void route();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main id="main" className="grid min-h-[60vh] place-items-center px-4">
      {stuck ? (
        <div role="alert" className="text-center">
          <p className="font-bold">We couldn&rsquo;t work out where to send you.</p>
          <p className="text-latte mt-2 text-sm">
            <a href="/login" className="text-rose-ink font-extrabold underline">
              Sign in again
            </a>
          </p>
        </div>
      ) : (
        <p role="status" aria-live="polite" className="text-latte">
          <span className="sr-only">Signing you in</span>
          <span aria-hidden="true">…</span>
        </p>
      )}
    </main>
  );
}
