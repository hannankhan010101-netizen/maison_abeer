import type { Metadata } from 'next';

import { BroadcastComposer } from '@/components/domain/BroadcastComposer';

export const metadata: Metadata = { title: 'Broadcast · Maison Abeer' };

export default function BroadcastPage() {
  return <BroadcastComposer />;
}
