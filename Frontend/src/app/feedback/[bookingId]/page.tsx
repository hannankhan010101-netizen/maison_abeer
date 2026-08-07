import type { Metadata } from 'next';

import { FeedbackFlow } from '@/components/public/FeedbackFlow';

/**
 * The guest-facing feedback page, linked from the thank-you message.
 *
 * Public, like `/book` — the person arriving has no account and should not be
 * offered one. `middleware.ts` lists `/feedback` so it never redirects to a
 * login form.
 */

export const metadata: Metadata = {
  title: 'How was it?',
  // Never indexed: the URL is a capability, and a search engine holding a
  // list of them would defeat the point.
  robots: { index: false, follow: false },
};

export default async function FeedbackPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;

  return <FeedbackFlow bookingId={bookingId} />;
}
