import type { Metadata } from 'next';

import { redirect } from 'next/navigation';

import { ChatThread } from '@/components/portal/ChatThread';
import { CHAT_ENABLED } from '@/lib/features';

export const metadata: Metadata = { title: 'Chat · Maison Abeer' };

export default async function ChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  if (!CHAT_ENABLED) redirect('/portal');

  const { roomId } = await params;

  return <ChatThread roomId={roomId} />;
}
