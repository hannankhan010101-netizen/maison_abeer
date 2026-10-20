'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { MemoryImage } from '@/components/public/memories/MemoryImage';
import type { Memory } from '@/lib/public/memories';
import { useDismissable } from '@/lib/useDismissable';

/**
 * A photograph, opened.
 *
 * Mounted only while open, so `useDismissable` is always told `open`: it moves
 * focus in, traps Tab, closes on Escape and locks the page's scroll, and gives
 * focus back to whatever opened it. The photo carries the page's one
 * `view-transition-name`, so the browser can carry the tapped tile into it.
 *
 * Portalled to `body`: the wall sits inside a section that is transformed while
 * it reveals, and a transformed ancestor would turn `position: fixed` into
 * "fixed to that section".
 */
export interface LightboxProps {
  items: Memory[];
  index: number;
  onClose: () => void;
  onStep: (delta: 1 | -1) => void;
}

export function Lightbox({ items, index, onClose, onStep }: LightboxProps) {
  const ref = useDismissable<HTMLDivElement>(true, onClose);
  const memory = items[index];
  const several = items.length > 1;

  useEffect(() => {
    if (!several) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') onStep(1);
      else if (event.key === 'ArrowLeft') onStep(-1);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [several, onStep]);

  if (!memory || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="memory-lightbox"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <figure className="memory-lightbox-figure">
        <MemoryImage
          memory={memory}
          sizes="100vw"
          className="memory-lightbox-photo"
          style={{ viewTransitionName: 'memory' }}
        />
        <figcaption className="font-hand memory-lightbox-caption">{memory.caption}</figcaption>
      </figure>

      <button type="button" onClick={onClose} className="memory-lightbox-btn memory-close">
        Close
      </button>
      {several ? (
        <>
          <button
            type="button"
            onClick={() => onStep(-1)}
            aria-label="Previous photo"
            className="memory-lightbox-btn memory-prev"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            onClick={() => onStep(1)}
            aria-label="Next photo"
            className="memory-lightbox-btn memory-next"
          >
            <span aria-hidden="true">→</span>
          </button>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
