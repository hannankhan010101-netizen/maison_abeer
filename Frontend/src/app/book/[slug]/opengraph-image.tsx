import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { fetchStudioForMetadata, seatsBlurb } from '@/lib/public/metadata';
import { OgCard, titleCaseSlug } from '@/lib/public/ogCard';
import { craftsIn } from '@/lib/public/studioPhotos';

/**
 * The card a booking link unfurls into, beside the page it previews.
 *
 * Cached five minutes. Never throws: if the API is down the card falls back
 * to the slug, title-cased, with no stickers and no seats line; if the font
 * cannot be read it renders in the renderer's built-in sans.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;
export const alt = 'The studio, and the seats left in its next class';

async function fraunces(): Promise<ArrayBuffer | Buffer | null> {
  try {
    // A literal `process.cwd()` join is what Next traces into the serverless bundle.
    return await readFile(join(process.cwd(), 'src/fonts/fraunces-og.woff'));
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fallback = { name: titleCaseSlug(slug) || 'Book a class', crafts: [], seats: null };

  let card: Parameters<typeof OgCard>[0] = fallback;
  try {
    const list = await fetchStudioForMetadata(slug);
    if (list) {
      card = {
        name: list.studio.name || fallback.name,
        crafts: craftsIn(list.classes.map((item) => item.color_token)),
        seats: seatsBlurb(list.classes),
      };
    }
  } catch {
    card = fallback;
  }

  const data = await fraunces();
  const fonts = data
    ? [{ name: 'Fraunces', data, weight: 600 as const, style: 'normal' as const }]
    : undefined;

  return new ImageResponse(<OgCard {...card} />, { ...size, ...(fonts ? { fonts } : {}) });
}
