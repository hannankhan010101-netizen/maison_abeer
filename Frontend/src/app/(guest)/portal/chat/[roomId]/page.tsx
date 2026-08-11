import type { Metadata } from 'next';

import { ChatThread } from '@/components/portal/ChatThread';

export const metadata: Metadata = { title: 'Chat · Maison Abeer' };

export default async function ChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;

  return <ChatThread roomId={roomId} />;
}
