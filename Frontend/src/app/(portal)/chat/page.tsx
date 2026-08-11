import type { Metadata } from 'next';

import { ChatAdmin } from '@/components/domain/ChatAdmin';

export const metadata: Metadata = { title: 'Chat oversight · Maison Abeer' };

export default function ChatAdminPage() {
  return <ChatAdmin />;
}
