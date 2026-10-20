import type { CSSProperties } from 'react';

import type { StudioPhoto } from '@/lib/public/studioPhotos';

/**
 * One of the studio's own photographs, sized properly.
 *
 * A plain `<img>` with a two-file `srcSet` rather than `next/image`: these are
 * static files already cut to the two widths that matter (see
 * `studioPhotos.ts`), so there is nothing for an image optimiser to add — and
 * one fewer thing that has to be installed and running for them to appear.
 *
 * `width`/`height` are the real pixel size, so the browser reserves the right
 * box before the file arrives. Callers pass `sizes` because only they know how
 * wide the picture is laid out; without it the browser assumes full width and
 * a phone downloads the large file for a thumbnail.
 *
 * The photo's average colour sits behind it while it loads, so a card never
 * flashes empty.
 *
 * Pass `alt=""` for a repeat of a photo already described nearby — the second
 * copy of a looping strip, say — so a screen reader hears each picture once.
 */
export interface StudioImageProps {
  photo: StudioPhoto;
  sizes: string;
  alt?: string;
  eager?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function StudioImage({
  photo,
  sizes,
  alt = photo.alt,
  eager = false,
  className,
  style,
}: StudioImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- self-hosted, pre-sized in two widths; see above
    <img
      src={photo.small}
      srcSet={`${photo.small} 800w, ${photo.src} 1400w`}
      sizes={sizes}
      width={photo.width}
      height={photo.height}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      className={className}
      style={{ backgroundColor: photo.tone, ...style }}
    />
  );
}
