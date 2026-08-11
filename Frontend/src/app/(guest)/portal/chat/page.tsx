import type { Metadata } from 'next';

import { ChatRoomList } from '@/components/portal/ChatRoomList';

export const metadata: Metadata = { title: 'Chats · Maison Abeer' };

export default function ChatPage() {
  return <ChatRoomList />;
}
