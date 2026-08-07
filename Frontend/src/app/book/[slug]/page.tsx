import type { Metadata } from 'next';

import { BookingFlow } from '@/components/public/BookingFlow';

/**
 * The public booking page — the link that goes in an ad.
 *
 * Outside the `(portal)` group on purpose: it must not inherit the app shell,
 * the nav, or the auth provider. A guest arriving here has no account, and
 * offering them one would be a dead end.
 *
 * `middleware.ts` lists `/book` as public, so this never redirects to login.
 */

export const metadata: Metadata = {
  title: 'Book a class',
  description: 'Pick a workshop and save your seat.',
  // Ad landing pages get shared and re-shared; nothing here should be indexed
  // as the studio's canonical page, and a stale class in search results is
  // worse than none.
  robots: { index: false, follow: false },
};

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return <BookingFlow slug={slug} />;
}
