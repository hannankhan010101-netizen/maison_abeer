import type { CSSProperties } from 'react';

import { StudioImage } from '@/components/public/StudioImage';
import type { Memory } from '@/lib/public/memories';

/**
 * A memory's picture. The studio's own craft photographs go through
 * `StudioImage`; a photo the studio linked to is a plain `<img>` of unknown
 * size, cropped to its frame.
 */
export function MemoryImage({
  memory,
  sizes,
  alt = memory.photo.alt,
  className,
  style,
}: {
  memory: Memory;
  sizes: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { photo } = memory;

  if (memory.origin === 'craft' && memory.craft && photo.small) {
    return (
      <StudioImage
        photo={{
          id: memory.id,
          craft: memory.craft,
          src: photo.src,
          small: photo.small,
          width: photo.width,
          height: photo.height,
          tone: photo.tone,
          alt: photo.alt,
          caption: memory.caption,
        }}
        sizes={sizes}
        alt={alt}
        className={className}
        style={style}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a studio-supplied link of unknown size, like CraftChapters
    <img
      src={photo.src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={className}
      style={{ backgroundColor: photo.tone, ...style }}
    />
  );
}
