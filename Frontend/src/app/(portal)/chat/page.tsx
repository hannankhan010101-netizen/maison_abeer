import type { Metadata } from 'next';
import { Suspense } from 'react';

import { redirect } from 'next/navigation';

import { ChatAdmin } from '@/components/domain/ChatAdmin';
import { CHAT_ENABLED } from '@/lib/features';

export const metadata: Metadata = { title: 'Chat oversight · Maison Abeer' };

export default function ChatAdminPage() {
  // Hidden for now; a bookmark or an installed app's history lands on Today instead.
  if (!CHAT_ENABLED) redirect('/today');

  // `ChatAdmin` reads `?room=` so a guest's Message button can deep-link into
  // their thread. `useSearchParams` opts the tree into client rendering and
  // needs a boundary, or the build fails on prerender.
  return (
    <Suspense fallback={null}>
      <ChatAdmin />
    </Suspense>
  );
}
