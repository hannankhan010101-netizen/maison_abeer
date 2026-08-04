'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Sign out.
 *
 * `router.refresh()` after signing out matters: without it the cached server
 * render of the portal stays on screen until something else forces a fetch.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);

    try {
      await getSupabaseBrowserClient().auth.signOut();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      loadingLabel="signing out…"
      onClick={signOut}
    >
      sign out
    </Button>
  );
}
