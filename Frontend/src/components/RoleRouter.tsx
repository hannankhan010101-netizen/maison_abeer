'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { fetchRole } from '@/lib/auth/role';
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

      const role = await fetchRole(token);
      if (cancelled) return;

      if (role === 'unreachable') {
        // The API being unreachable must not strand someone on a blank page
        // with no way forward.
        setStuck(true);
        return;
      }

      // 'unknown' — authenticated but matched to no record — goes to the
      // portal on purpose: the claim flow there is what explains the
      // situation. The host dashboard would give them a wall of 401s instead.
      router.replace(role === 'host' ? '/today' : '/portal');
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
