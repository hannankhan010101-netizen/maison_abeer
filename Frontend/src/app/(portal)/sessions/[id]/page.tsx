import type { Metadata } from 'next';

import { SessionDetail } from '@/components/domain/SessionDetail';

export const metadata: Metadata = {
  title: 'Class · Maison Abeer',
};

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <SessionDetail sessionId={id} />;
}
