import type { ReactNode } from 'react';

import { GuestShell } from '@/components/portal/GuestShell';

/**
 * The guest side of the app.
 *
 * A separate route group from `(portal)` on purpose: the host shell carries a
 * nav to the calendar, prep, tags and settings, none of which a guest may
 * reach. Sharing a layout would make that a styling problem rather than a
 * structural one, and a styling problem is one refactor from being a leak.
 */

export default function GuestLayout({ children }: { children: ReactNode }) {
  return <GuestShell>{children}</GuestShell>;
}
