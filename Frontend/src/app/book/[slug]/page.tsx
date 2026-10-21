import type { Metadata } from 'next';

import { BookingFlow } from '@/components/public/BookingFlow';
import {
  fetchStudioForMetadata,
  siteBase,
  storefrontDescription,
  storefrontTitle,
} from '@/lib/public/metadata';

/**
 * The public booking page — the link that goes in an ad.
 *
 * Outside the `(portal)` group on purpose: it must not inherit the app shell,
 * the nav, or the auth provider. A guest arriving here has no account, and
 * offering them one would be a dead end.
 *
 * `middleware.ts` lists `/book` as public, so this never redirects to login.
 */

/**
 * What the link says when it is pasted into a DM: the studio's name, a line
 * from its story or its crafts, and the card beside this file. If the API is
 * slow or down, the plain fallback renders instead — this never blocks the
 * page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const list = await fetchStudioForMetadata(slug);

  const title = storefrontTitle(list?.studio.name ?? null);
  const description = storefrontDescription(list?.studio ?? null, list?.classes ?? []);

  return {
    title,
    description,
    metadataBase: siteBase(),
    openGraph: {
      title,
      description,
      images: [{ url: `/book/${slug}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description },
    // Ad landing pages get shared and re-shared; nothing here should be indexed
    // as the studio's canonical page, and a stale class in search results is
    // worse than none.
    robots: { index: false, follow: false },
  };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return <BookingFlow slug={slug} />;
}
