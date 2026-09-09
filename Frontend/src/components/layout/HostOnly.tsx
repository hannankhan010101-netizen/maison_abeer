'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { fetchRole } from '@/lib/auth/role';
import { getAccessToken } from '@/lib/supabase/client';

/**
 * Keeps guests out of the host side of the app.
 *
 * Not a security control — the API is. Every host route already answers 403 to
 * a guest token, and that is what actually protects the data.
 *
 * This exists because being refused and being lost are different experiences.
 * A guest who wandered to `/today` used to get the full host navigation —
 * Guests, Receipts, Settings — sitting above a panel that said "Loading your
 * day…" forever, because every request behind it was quietly 403ing. Nothing
 * leaked, and it still read as a broken app while advertising a feature set
 * that was never theirs.
 *
 * That was close to unreachable while almost no guest had an account. Now that
 * booking creates one for everybody, it is a normal mistap, so it is worth
 * handling.
 *
 * Children render while the role is still unknown. Hosts are the overwhelming
 * majority of traffic here and must not wait on a round trip to see their own
 * dashboard; a guest sees the shell for the instant before the redirect lands.
 */
export function HostOnly({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const token = await getAccessToken();
      if (!token || cancelled) return;

      // Only 'guest' redirects. 'unknown' means the API could not answer, and
      // bouncing a host to the guest portal because their connection dropped
      // would be worse than the empty screen this is here to prevent.
      if ((await fetchRole(token)) === 'guest' && !cancelled) {
        router.replace('/portal');
      }
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return <>{children}</>;
}
