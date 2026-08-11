import type { Metadata } from 'next';

import { WorkshopDetail } from '@/components/portal/WorkshopDetail';

export const metadata: Metadata = { title: 'Workshop · Maison Abeer' };

export default async function PortalWorkshopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <WorkshopDetail sessionId={id} />;
}
