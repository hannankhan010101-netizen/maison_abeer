import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicClassList } from '@/lib/public/api';

const fetchStudioForMetadata = vi.fn<(slug: string) => Promise<PublicClassList | null>>();

vi.mock('@/lib/public/metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/public/metadata')>();
  return { ...actual, fetchStudioForMetadata: (slug: string) => fetchStudioForMetadata(slug) };
});

const fetchClassesServer = vi.fn<(slug: string) => Promise<PublicClassList | null>>();

vi.mock('@/lib/public/serverClasses', () => ({
  fetchClassesServer: (slug: string) => fetchClassesServer(slug),
}));

vi.mock('@/components/public/BookingFlow', () => ({ BookingFlow: () => null }));

const page = await import('./page');
const { generateMetadata } = page;
const BookPage = page.default;
const { BookingFlow } = await import('@/components/public/BookingFlow');
const { siteBase } = await import('@/lib/public/metadata');

const params = Promise.resolve({ slug: 'maison-abeer' });

const list: PublicClassList = {
  studio: {
    name: 'Maison Abeer',
    instagram_handle: null,
    logo_url: null,
    primary_color: null,
    accent_color: null,
    hero_photo_url: null,
    story: null,
  },
  classes: [
    {
      id: 'a',
      name: 'Wheel throwing',
      starts_at: '2026-11-01T10:00:00Z',
      ends_at: '2026-11-01T12:00:00Z',
      location: null,
      color_token: 'terra',
      photo_url: null,
      seats_left: 8,
      is_full: false,
      waitlist_is_open: false,
    },
  ],
};

type Image = { url: string; width: number; height: number };

beforeEach(() => {
  fetchStudioForMetadata.mockReset();
  fetchClassesServer.mockReset();
});

describe('generateMetadata', () => {
  it('names the studio and points the card at its image', async () => {
    fetchStudioForMetadata.mockResolvedValue(list);

    const metadata = await generateMetadata({ params });

    expect(fetchStudioForMetadata).toHaveBeenCalledWith('maison-abeer');
    expect(metadata.title).toBe('Maison Abeer · book a class');
    expect(metadata.description).toBe("Pottery classes — pick one and we'll keep you a seat");
    const image = (metadata.openGraph?.images as Image[])[0];
    expect(image?.url.endsWith('/book/maison-abeer/opengraph-image')).toBe(true);
    expect([image?.width, image?.height]).toEqual([1200, 630]);
    expect((metadata.twitter as { card?: string }).card).toBe('summary_large_image');
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.metadataBase?.href).toBe(siteBase().href);
  });

  it('falls back to the plain page when the API is unreachable', async () => {
    fetchStudioForMetadata.mockResolvedValue(null);

    const metadata = await generateMetadata({ params });

    expect(metadata.title).toBe('Book a class');
    expect(metadata.description).toBe('Pick a workshop and save your seat.');
    expect(metadata.openGraph?.images as Image[]).toHaveLength(1);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe('BookPage', () => {
  it('hands the server-fetched schedule to the flow as initial data', async () => {
    fetchClassesServer.mockResolvedValue(list);

    const element = await BookPage({ params });

    expect(fetchClassesServer).toHaveBeenCalledWith('maison-abeer');
    expect(element.type).toBe(BookingFlow);
    expect(element.props).toEqual({ slug: 'maison-abeer', initialData: list });
  });

  it('still renders, with null initial data, when the server fetch fails', async () => {
    fetchClassesServer.mockResolvedValue(null);

    const element = await BookPage({ params });

    expect(element.type).toBe(BookingFlow);
    expect(element.props).toEqual({ slug: 'maison-abeer', initialData: null });
  });

  it('revalidates every 15 s and builds each slug on demand', () => {
    expect(page.revalidate).toBe(15);
    expect(page.generateStaticParams()).toEqual([]);
  });
});
