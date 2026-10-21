'use client';

import { useId, type CSSProperties } from 'react';

import { StickerMorph } from '@/components/public/atmosphere/StickerMorph';
import { StickerCake, StickerPalette, StickerPot } from '@/components/public/CraftStickers';
import { StudioImage } from '@/components/public/StudioImage';
import { cn } from '@/lib/cn';
import type { PublicClass } from '@/lib/public/api';
import { scrollToId } from '@/lib/public/lenisBridge';
import { allocatePhotos, type PhotoBudget } from '@/lib/public/photoBudget';
import {
  CRAFT_COPY,
  accentPhotoFor,
  chapterPhotoFor,
  craftOf,
  craftsIn,
  type CraftKind,
} from '@/lib/public/studioPhotos';
import { useRevealOnScroll } from '@/lib/public/useRevealOnScroll';
import { useScrollParallax } from '@/lib/public/useScrollParallax';
import '@/styles/units/atmosphere.css';

/**
 * "Pick your kind of mess" — one chapter for each craft the studio actually
 * teaches, derived from the real classes on offer rather than a hardcoded
 * three. A studio that only runs pottery shouldn't advertise cake decorating
 * just because this app's palette has a slot for it — and with one chapter
 * there is nothing to pick between, so the menu heading goes and the chapter
 * stands under its own eyebrow (the section is named after the class).
 *
 * The photographs come from the page's photo budget (`allocatePhotos`), which
 * steers each chapter away from the ones the polaroid fan already showed.
 *
 * Each chapter is a tall photograph beside a few lines in the studio's voice,
 * alternating sides down the page. The photograph is, in order of preference:
 * the class type's own (Brand Kit → class photos, same paste-a-link pattern as
 * the studio's logo), else the studio's own set for that craft
 * (`studioPhotos.ts`). Neither is a placeholder for the other.
 *
 * Three things move, all of them gated on `prefers-reduced-motion`:
 *
 * - The photograph is **uncovered**: it starts as a smaller window cut into
 *   the page (`clip-path`) with the picture inside enlarged, and as the
 *   chapter scrolls into view the window opens to the full frame while the
 *   picture settles to size. A reveal, not a fade.
 * - Once visible, the picture **drifts inside its frame** at a different speed
 *   from the page (`useScrollParallax`) — depth, with the frame itself fixed.
 * - A small polaroid of the same craft and a sticker are pinned to the corner
 *   and arrive a beat later, so the eye is led from the big picture to the
 *   small one to the words.
 *
 * Under reduced motion every one of those is already at its end state: the
 * photograph is simply there.
 */

interface Craft {
  token: string;
  kind: CraftKind;
  name: string;
  /** The class type's own photo, when the host has set one. */
  photoUrl: string | null;
}

/** One chapter per distinct colour token, first-seen order — not alphabetised,
 * so the studio's own scheduling emphasis (what they lead with) carries
 * through rather than being flattened into a fixed list. */
function craftsFrom(classes: PublicClass[]): Craft[] {
  const seen = new Map<string, Craft>();

  for (const item of classes) {
    if (!seen.has(item.color_token)) {
      seen.set(item.color_token, {
        token: item.color_token,
        kind: craftOf(item.color_token),
        name: item.name,
        photoUrl: item.photo_url,
      });
    }
  }

  return [...seen.values()];
}

const STICKERS = {
  pottery: StickerPot,
  cake: StickerCake,
  painting: StickerPalette,
} as const;

export function CraftChapters({ classes }: { classes: PublicClass[] }) {
  // One chapter per craft, not per class type: two cake classes (pink and butter
  // both read as cake) would otherwise get two chapters with the same photographs.
  const crafts = craftsFrom(classes).filter(
    (craft, index, all) => all.findIndex((other) => other.kind === craft.kind) === index,
  );
  if (crafts.length === 0) return null;

  const budget = allocatePhotos(craftsIn(classes.map((item) => item.color_token)));
  const menu = crafts.length > 1;

  return (
    <section
      aria-labelledby={menu ? 'chapters-heading' : undefined}
      aria-label={menu ? undefined : classes[0]!.name}
      className="px-4 sm:px-6"
    >
      {menu && (
        <header className="mx-auto mb-14 max-w-[680px] text-center">
          <StickerMorph className="mx-auto mb-2 w-14" />
          <p className="font-hand text-rose-ink text-xl">all of it is welcome</p>
          <h2
            id="chapters-heading"
            className="font-display mt-1 text-[clamp(28px,5.4vw,44px)] leading-[1.06] text-balance"
          >
            Pick your kind of mess
          </h2>
        </header>
      )}

      <div
        className="chapter-stack mx-auto grid max-w-[1040px] gap-20 sm:gap-28"
        style={{ '--tl-scope': crafts.map((_, i) => `--chapter-${i}`).join(', ') } as CSSProperties}
      >
        {crafts.map((craft, index) => (
          <Chapter
            key={craft.token}
            craft={craft}
            photos={budget.chapters[craft.kind]}
            index={index}
            hasNext={index < crafts.length - 1}
          />
        ))}
      </div>
    </section>
  );
}

function Chapter({
  craft,
  photos,
  index,
  hasNext,
}: {
  craft: Craft;
  photos: PhotoBudget['chapters'][CraftKind];
  index: number;
  hasNext: boolean;
}) {
  const [ref, visible] = useRevealOnScroll<HTMLElement>();
  const parallaxRef = useScrollParallax<HTMLDivElement>(7);
  const headingId = useId();

  const copy = CRAFT_COPY[craft.kind];
  // The budget has a pair for every craft taught; the fixed set is only a
  // type-level fallback.
  const main = photos?.large ?? chapterPhotoFor(craft.kind);
  const accent = photos?.accent ?? accentPhotoFor(craft.kind);
  const Sticker = STICKERS[craft.kind];
  const flip = index % 2 === 1;

  return (
    <article
      ref={ref}
      aria-labelledby={headingId}
      data-craft-chapter={craft.kind}
      data-has-next={hasNext ? '' : undefined}
      className="chapter grid items-center gap-12 md:grid-cols-2 md:gap-16"
      style={
        {
          '--tl-self': `--chapter-${index}`,
          '--tl-next': `--chapter-${index + 1}`,
        } as CSSProperties
      }
    >
      <div className={cn('relative px-2 md:px-0', flip && 'md:order-2')}>
        {/* The shadow is a `drop-shadow` on a parent, not a `box-shadow` on the
            frame: `clip-path` clips a box-shadow to the clipped shape, so the
            frame would sit shadowless until the window had fully opened. */}
        <div className="drop-shadow-[0_26px_26px_rgb(64_48_42_/20%)]">
          <div
            data-parallax-frame
            className="bg-blush relative aspect-[4/5] w-full overflow-hidden rounded-[var(--radius-xl)]"
            style={{
              clipPath: visible
                ? 'inset(0% 0% 0% 0% round 28px)'
                : 'inset(13% 11% 13% 11% round 28px)',
              transition: 'clip-path 1200ms cubic-bezier(0.22, 0.7, 0.2, 1)',
            }}
          >
            <div
              className={cn(
                'absolute inset-0 transition-transform duration-[1500ms] ease-out',
                visible ? 'scale-100' : 'scale-[1.22]',
              )}
            >
              {/* 116% tall and lifted 8%: the picture has to be larger than its
                  frame by more than the drift, or the drift would uncover an
                  edge. */}
              <div ref={parallaxRef} className="absolute inset-x-0 -top-[8%] h-[116%]">
                {craft.photoUrl ? (
                  // A host pastes any URL they like into Brand Kit, so there is
                  // no fixed set of hosts for `next/image` to allowlist.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={craft.photoUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                ) : (
                  <StudioImage
                    photo={main}
                    sizes="(min-width: 1040px) 520px, (min-width: 768px) 46vw, 92vw"
                    className="size-full object-cover"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <figure
          className={cn(
            'border-line bg-paper absolute -bottom-8 w-[128px] rounded-[6px] border p-1.5 pb-7 sm:w-[168px]',
            'shadow-[var(--shadow-lift)] transition-[opacity,transform] delay-500 duration-700 motion-reduce:transition-none',
            flip ? '-left-1 md:-left-10' : '-right-1 md:-right-10',
            visible
              ? flip
                ? 'translate-y-0 -rotate-6 opacity-100'
                : 'translate-y-0 rotate-6 opacity-100'
              : 'translate-y-8 rotate-0 opacity-0',
          )}
        >
          <div className="aspect-[4/5] overflow-hidden rounded-[3px]">
            <StudioImage photo={accent} sizes="168px" className="size-full object-cover" />
          </div>
          <figcaption className="font-hand text-cocoa absolute inset-x-0 bottom-1 text-center text-base leading-none sm:text-lg">
            {accent.caption}
          </figcaption>
        </figure>

        <Sticker
          className={cn(
            'animate-float absolute -top-7 w-14 sm:w-[72px]',
            flip ? '-right-1 md:-right-6' : '-left-1 md:-left-6',
          )}
          style={{ '--float-rot': flip ? '8deg' : '-8deg' } as React.CSSProperties}
        />
      </div>

      {/* Opacity and rise belong to atmosphere.css: `data-shown` is the JS
          reveal's switch, and where the browser can tie the reveal to the
          scroll itself the stylesheet lets go of it. The words sit flush left
          at every width, whichever side the photo is on: a deliberate break
          from the centred headers around them. */}
      <div
        data-shown={visible}
        className={cn(
          'chapter-text flex flex-col items-start text-left md:text-left',
          flip ? 'md:pr-4' : 'md:pl-4',
        )}
      >
        <p className="font-hand text-rose-ink text-xl">{copy.eyebrow}</p>
        <h3
          id={headingId}
          className="font-display mt-1 text-[clamp(28px,4.6vw,46px)] leading-[1.04] text-balance"
        >
          {craft.name}
        </h3>
        <p className="text-cocoa mt-4 max-w-[38ch] text-[15px] leading-relaxed sm:text-[17px]">
          {copy.blurb}
        </p>

        <a
          href="#booking-widget"
          onClick={(event) => {
            event.preventDefault();
            scrollToId('booking-widget');
          }}
          className={cn(
            'sheen-on-hover group bg-rose text-on-rose relative mt-7 inline-flex min-h-[52px] items-center gap-2 overflow-hidden',
            'rounded-[var(--radius-pill)] px-7 text-[15px] font-extrabold',
            'shadow-[0_16px_32px_-14px_var(--color-rose)] transition-transform duration-200',
            'hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transform-none',
            'focus-visible:outline-cocoa focus-visible:outline-[3px] focus-visible:outline-offset-2',
          )}
        >
          Save a seat
          <span
            aria-hidden="true"
            className="transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
          >
            →
          </span>
        </a>
      </div>
    </article>
  );
}
