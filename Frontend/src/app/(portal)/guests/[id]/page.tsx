import type { Metadata } from 'next';

import { GuestProfile } from '@/components/domain/GuestProfile';

export const metadata: Metadata = {
  // The guest's name is not in the title on purpose: it would land in the
  // browser history and tab bar of a shared studio laptop.
  title: 'Guest · Maison Abeer',
};

export default async function GuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <GuestProfile guestId={id} />;
}
