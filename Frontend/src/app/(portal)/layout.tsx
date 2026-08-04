'use client';

import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { ApiProvider } from '@/lib/api/provider';

/**
 * The signed-in area.
 *
 * The provider sits inside the route group rather than the root layout, so
 * `/login` never constructs an API client it has no session for.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <ApiProvider>
      <AppShell>{children}</AppShell>
    </ApiProvider>
  );
}
