import type { Metadata } from 'next';

import { redirect } from 'next/navigation';

import { ChatRoomList } from '@/components/portal/ChatRoomList';
import { CHAT_ENABLED } from '@/lib/features';

export const metadata: Metadata = { title: 'Chats · Maison Abeer' };

export default function ChatPage() {
  if (!CHAT_ENABLED) redirect('/portal');

  return <ChatRoomList />;
}
