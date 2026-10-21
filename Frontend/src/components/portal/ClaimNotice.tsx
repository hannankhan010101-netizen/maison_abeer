'use client';

import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, HandNote } from '@/components/ui/Card';
import { useClaimAccount } from '@/lib/api/hooks';

/**
 * Match this Supabase identity to a guest record, once, and say so when it
 * cannot be done.
 *
 * Runs on mount rather than in the auth callback so it survives a guest who
 * bookmarks `/portal` and returns later — the callback fires once, but the
 * link between identity and booking has to exist on every visit.
 *
 * Safe to repeat: the endpoint returns the existing match rather than
 * re-pointing anything.
 *
 * It used to render nothing at all, so a guest whose sign-in email matched no
 * booking (and a guest whose check simply failed) both landed on an empty list
 * with no idea why. A match stays silent; the other two outcomes explain
 * themselves.
 */
export function ClaimNotice() {
  const claim = useClaimOnMount();

  if (claim.isError) {
    return (
      <Card className="mb-5">
        <div role="alert">
          <p className="font-bold">{"We couldn't check your bookings just now"}</p>
          <Button variant="ghost" className="mt-3" onClick={() => claim.mutate()}>
            Try again
          </Button>
        </div>
      </Card>
    );
  }

  if (claim.isSuccess && claim.data && !claim.data.claimed) {
    return (
      <Card className="mb-5">
        <div role="status">
          {/* Server text, written for the guest: it names the actual reason. */}
          <p className="font-bold">{claim.data.message}</p>
          <p className="text-latte mt-2 text-sm">
            <HandNote>
              Use the email you booked with, or ask your studio to resend your link
            </HandNote>
          </p>
        </div>
      </Card>
    );
  }

  return null;
}

/**
 * The same single check with no visible output, for an open thread: the
 * conversation owns the whole screen, so there is nowhere to put a card.
 */
export function ClaimSilently() {
  useClaimOnMount();
  return null;
}

function useClaimOnMount() {
  const claim = useClaimAccount();
  // StrictMode mounts, unmounts and remounts in development; the ref survives
  // that, so the endpoint is still asked exactly once per real mount.
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    claim.mutate();
    // Once per mount. Re-running on every render would hammer the endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return claim;
}
