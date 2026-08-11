import type { Metadata } from 'next';

import { MyWorkshops } from '@/components/portal/MyWorkshops';

export const metadata: Metadata = { title: 'Your workshops · Maison Abeer' };

export default function PortalPage() {
  return <MyWorkshops />;
}
