import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ChatAdmin } from '@/components/domain/ChatAdmin';

export const metadata: Metadata = { title: 'Chat oversight · Maison Abeer' };

export default function ChatAdminPage() {
  // `ChatAdmin` reads `?room=` so a guest's Message button can deep-link into
  // their thread. `useSearchParams` opts the tree into client rendering and
  // needs a boundary, or the build fails on prerender.
  return (
    <Suspense fallback={null}>
      <ChatAdmin />
    </Suspense>
  );
}
