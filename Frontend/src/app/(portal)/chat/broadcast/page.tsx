import type { Metadata } from 'next';

import { redirect } from 'next/navigation';

import { BroadcastComposer } from '@/components/domain/BroadcastComposer';
import { CHAT_ENABLED } from '@/lib/features';

export const metadata: Metadata = { title: 'Broadcast · Maison Abeer' };

export default function BroadcastPage() {
  if (!CHAT_ENABLED) redirect('/today');

  return <BroadcastComposer />;
}
