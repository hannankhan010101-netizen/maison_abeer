'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { flushSync } from 'react-dom';

import { Lightbox } from '@/components/public/memories/Lightbox';
import { MemoryTile } from '@/components/public/memories/MemoryTile';
import { WordWall } from '@/components/public/memories/WordWall';
import { Reveal } from '@/components/motion/Reveal';
import { cn } from '@/lib/cn';
import { loadGsap, useMayAnimate, withViewTransition } from '@/lib/motion';
import type { PublicClass, PublicMemory, PublicWord } from '@/lib/public/api';
import { buildMemories, layoutSpans } from '@/lib/public/memories';
import { craftsIn, type CraftKind } from '@/lib/public/studioPhotos';

import '@/styles/units/memories.css';

/**
 * The memory wall — a bento mosaic of photographs, filter chips that reorder
 * it, hearts a guest can keep, and a lightbox the tapped photo opens into.
 *
 * What it is called depends on what it truly is (see `buildMemories`): until
 * the studio adds memories it is "What you'll make here", never "our
 * memories". Renders nothing at all when there is nothing honest to show.
 */
export interface MemoryWallProps {
  classes: PublicClass[];
  memories?: PublicMemory[];
  words?: PublicWord[];
}

const CRAFT_LABEL: Record<CraftKind, string> = {
  pottery: 'Pottery',
  cake: 'Cake',
  painting: 'Painting',
};

const HEARTS_KEY = 'maison-abeer:memory-hearts';

// Storage can be blocked (private modes, embedded browsers); a heart that does
// not survive a reload is better than a wall that does not render.
function readHearts(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HEARTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeHearts(ids: string[]) {
  try {
    localStorage.setItem(HEARTS_KEY, JSON.stringify(ids));
  } catch {
    // Kept for this visit only.
  }
}

export function MemoryWall({ classes, memories, words }: MemoryWallProps): JSX.Element | null {
  const mayAnimate = useMayAnimate();
  const { heading, eyebrow, items } = useMemo(
    () => buildMemories(craftsIn(classes.map((c) => c.color_token)), memories),
    [classes, memories],
  );

  const [filter, setFilter] = useState<CraftKind | null>(null);
  const [hearts, setHearts] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  // The tile the transition starts from or returns to; it holds the page's
  // only `view-transition-name` whenever the lightbox photo does not.
  const [originId, setOriginId] = useState<string | null>(null);

  const gridRef = useRef<HTMLUListElement>(null);
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  const busy = useRef(false);
  // Counts every open and close, so a close that finishes after a newer open
  // has begun can tell it is stale and leave focus and the name alone.
  const sequence = useRef(0);

  useEffect(() => {
    // Read after mount: the server cannot know a guest's hearts.
    setHearts(readHearts());
  }, []);

  const chipCrafts = useMemo(
    () => [...new Set(items.flatMap((item) => (item.craft ? [item.craft] : [])))],
    [items],
  );
  const shown = useMemo(
    () => items.filter((item) => filter === null || item.craft === filter),
    [items, filter],
  );

  // Sized from what is visible, so a filtered wall has no gaps either.
  const spanById = useMemo(() => {
    const { spans } = layoutSpans(
      shown.map((item) => ({ portrait: item.photo.height > item.photo.width })),
    );
    return new Map(shown.map((item, index) => [item.id, spans[index]!]));
  }, [shown]);

  const select = useCallback(
    async (next: CraftKind | null) => {
      if (!mayAnimate) {
        setFilter(next);
        return;
      }

      const kit = await loadGsap('Flip');
      const tiles = gridRef.current?.querySelectorAll<HTMLElement>('.memory-tile');
      if (!kit || !tiles) {
        setFilter(next);
        return;
      }

      // Flip: note where every tile is, change the layout, then play each tile
      // from where it was to where it is.
      const state = kit.Flip.getState(tiles);
      flushSync(() => setFilter(next));
      kit.Flip.from(state, {
        duration: 0.55,
        ease: 'power3.inOut',
        onEnter: (entering: Element[]) =>
          kit.gsap.fromTo(
            entering,
            { opacity: 0, scale: 0.85 },
            { opacity: 1, scale: 1, duration: 0.4 },
          ),
      });
    },
    [mayAnimate],
  );

  const toggleHeart = (id: string) => {
    const next = hearts.includes(id) ? hearts.filter((h) => h !== id) : [...hearts, id];
    setHearts(next);
    writeHearts(next);
  };

  const open = (id: string) => {
    // One at a time: a second tap while the first is still opening is ignored.
    if (busy.current || openId !== null) return;
    busy.current = true;
    sequence.current += 1;

    // Name the tile first so the "before" photograph has something to carry.
    flushSync(() => setOriginId(id));
    void withViewTransition(() => setOpenId(id)).finally(() => {
      busy.current = false;
    });
  };

  const close = useCallback(() => {
    const id = openId;
    const mine = (sequence.current += 1);

    // The tile keeps the name until the transition has landed, then lets go,
    // so it is never left named for the next one. Focus goes to the tile now
    // showing, which is not the one tapped if the guest paged on.
    void withViewTransition(() => setOpenId(null)).then(() => {
      if (sequence.current !== mine) return;
      setOriginId(null);
      if (id) tileRefs.current.get(id)?.focus();
    });
  }, [openId]);

  const step = useCallback(
    (delta: 1 | -1) => {
      const index = shown.findIndex((item) => item.id === openId);
      if (index === -1) return;
      const next = shown[(index + delta + shown.length) % shown.length]!;
      setOpenId(next.id);
      setOriginId(next.id);
    },
    [shown, openId],
  );

  if (items.length === 0 && (!words || words.length === 0)) return null;

  const openIndex = shown.findIndex((item) => item.id === openId);

  return (
    <section
      aria-labelledby="memories-heading"
      className="memory-wall scroll-mt-6 px-4 py-12 sm:px-6"
    >
      <Reveal className="mx-auto max-w-5xl">
        {items.length > 0 ? (
          <>
            {/* On a wide screen the heading and the chips share one row — a
                break from the centred headings elsewhere on the page. */}
            <div className="md:flex md:items-end md:justify-between md:gap-8">
              <div className="text-center md:text-left">
                <p className="font-hand text-rose-ink text-xl">{eyebrow}</p>
                <h2
                  id="memories-heading"
                  className="font-display text-cocoa mt-1 text-[clamp(26px,6vw,38px)]"
                >
                  {heading}
                </h2>
              </div>

              {chipCrafts.length >= 2 ? (
                <div className="memory-chips" role="group" aria-label="Filter photos by craft">
                  {[null, ...chipCrafts].map((craft) => (
                    <button
                      key={craft ?? 'all'}
                      type="button"
                      aria-pressed={filter === craft}
                      onClick={() => void select(craft)}
                      className={cn('memory-chip')}
                    >
                      {craft ? CRAFT_LABEL[craft] : 'All'}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <ul ref={gridRef} className="memory-grid mt-6">
              {items.map((item) => (
                <MemoryTile
                  key={item.id}
                  memory={item}
                  hidden={filter !== null && item.craft !== filter}
                  span={spanById.get(item.id) ?? { w: 1, h: 1 }}
                  hearted={hearts.includes(item.id)}
                  transitionName={originId === item.id && openId === null}
                  onOpen={() => open(item.id)}
                  onHeart={() => toggleHeart(item.id)}
                  buttonRef={(node) => {
                    if (node) tileRefs.current.set(item.id, node);
                    else tileRefs.current.delete(item.id);
                  }}
                />
              ))}
            </ul>
          </>
        ) : null}

        <WordWall words={words} />
      </Reveal>

      {openIndex !== -1 ? (
        <Lightbox items={shown} index={openIndex} onClose={close} onStep={step} />
      ) : null}
    </section>
  );
}
