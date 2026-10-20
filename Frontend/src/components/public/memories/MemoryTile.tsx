'use client';

import type { Ref } from 'react';

import { MemoryImage } from '@/components/public/memories/MemoryImage';
import type { Memory } from '@/lib/public/memories';

/**
 * One photograph in the mosaic.
 *
 * The tile is a button named by its caption (the picture inside is decorative
 * to a screen reader, so the name is not read twice). The heart is a sibling
 * button, not a child: a button inside a button is invalid and unreachable.
 * Hearts are private keepsakes — there is no count, because no one else's
 * hearts are counted anywhere.
 */
export interface MemoryTileProps {
  memory: Memory;
  hidden: boolean;
  hearted: boolean;
  /** Carries the shared-element name while a photo is opening or closing. */
  transitionName: boolean;
  onOpen: () => void;
  onHeart: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}

export function MemoryTile({
  memory,
  hidden,
  hearted,
  transitionName,
  onOpen,
  onHeart,
  buttonRef,
}: MemoryTileProps) {
  const portrait = memory.photo.height > memory.photo.width;

  return (
    <li
      className="memory-tile"
      hidden={hidden}
      data-span={portrait ? '2' : '1'}
      data-craft={memory.craft ?? undefined}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpen}
        className="memory-open"
        style={transitionName ? { viewTransitionName: 'memory' } : undefined}
      >
        <MemoryImage
          memory={memory}
          alt=""
          sizes="(min-width: 768px) 25vw, 50vw"
          className="memory-photo"
        />
        <span className="memory-caption font-hand">{memory.caption}</span>
      </button>
      <button
        type="button"
        onClick={onHeart}
        aria-pressed={hearted}
        aria-label={`Keep “${memory.caption}”`}
        className="memory-heart"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path
            d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 5 6.2 5c2 0 3.2 1 3.8 2.1h4C14.6 6 15.8 5 17.8 5c3.3 0 5.3 3.4 3.8 6.8C19.5 16.4 12 21 12 21z"
            fill={hearted ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </li>
  );
}
