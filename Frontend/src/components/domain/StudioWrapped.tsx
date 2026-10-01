'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { buildSlides, deriveWrapped, type Season } from '@/lib/wrapped/stats';
import type { Session } from '@/lib/api/types';

/**
 * Studio Wrapped.
 *
 * A story deck the host taps through, shaped 9:16 so a screenshot lands
 * straight into a story with no cropping. The PRD counts recap shares as a
 * success metric, and a card that has to be cropped never gets posted.
 *
 * Tap right to advance, left to go back, arrow keys for desktop — the
 * gestures people already know from every story format they use.
 */

export interface StudioWrappedProps {
  sessions: Session[];
  words: string[];
  season?: Season;
  now?: Date;
}

export function StudioWrapped({
  sessions,
  words,
  season = 'this season',
  now = new Date(),
}: StudioWrappedProps) {
  const { toast, celebrate } = useToast();

  const stats = useMemo(() => deriveWrapped({ sessions, words, now }), [sessions, words, now]);
  const slides = useMemo(() => buildSlides(stats, season), [stats, season]);

  const [index, setIndex] = useState(0);
  const slide = slides[index]!;
  const isLast = index === slides.length - 1;

  const next = useCallback(() => {
    setIndex((current) => {
      if (current < slides.length - 1) return current + 1;
      return current;
    });
  }, [slides.length]);

  const previous = useCallback(() => setIndex((current) => Math.max(0, current - 1)), []);

  // The last slide is the payoff, so it earns the confetti.
  useEffect(() => {
    if (isLast && slides.length > 2) celebrate();
  }, [isLast, slides.length, celebrate]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft') previous();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [next, previous]);

  return (
    <div className="mx-auto w-full max-w-[420px]">
      {/* Progress pips, the story convention. */}
      <div className="mb-2.5 flex gap-1" aria-hidden="true">
        {slides.map((item, position) => (
          <span
            key={item.id}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              position <= index ? 'bg-rose' : 'bg-line',
            )}
          />
        ))}
      </div>

      <div
        // 9:16, so a screenshot needs no cropping to become a story.
        //
        // `wrapped-slide` pins the four gradient stops `.mocha` redefines dark
        // (see tokens.css): five of the nine slides name one, and with a fixed
        // dark ink on top the card measured 1.03:1 in mocha — a dark-on-dark
        // screenshot. The card is a screenshot artifact, so BOTH sides of the
        // pair stop following the theme, not just the ink.
        className={cn(
          'wrapped-slide relative aspect-[9/16] w-full overflow-hidden rounded-[var(--radius-lg)]',
          'bg-gradient-to-br p-6 shadow-[var(--shadow-soft)]',
          slide.gradient,
        )}
      >
        {/* Tap zones. Buttons, so they are reachable by keyboard and named. */}
        <button
          type="button"
          onClick={previous}
          disabled={index === 0}
          aria-label="Previous slide"
          className="absolute inset-y-0 left-0 z-10 w-1/3 disabled:pointer-events-none"
        />
        <button
          type="button"
          onClick={next}
          disabled={isLast}
          aria-label="Next slide"
          className="absolute inset-y-0 right-0 z-10 w-2/3 disabled:pointer-events-none"
        />

        <div
          // One ink for the whole card, and a token rather than a literal so
          // contrast.test.ts asserts it against every stop stats.ts draws.
          // #4A2A33 was only ever measured against the light theme's stops.
          className="flex h-full flex-col justify-between text-[var(--color-wrapped-ink)]"
          // Announce each slide as it lands, so the story works read aloud.
          role="group"
          aria-live="polite"
          aria-label={`Slide ${index + 1} of ${slides.length}`}
        >
          <div>
            {/* No opacity on any run in this card. The ink is composited
                against the gradient, which contrast.test.ts cannot see, so
                an alpha utility here spends contrast nothing is watching: at
                0.7 this eyebrow measured 2.38:1 over the `via-terra` stop and
                the detail below 2.72:1 at 0.8 — both under PRD §3.4's 4.5:1,
                and neither run is anywhere near the large-text threshold.
                There is also no room for a lighter *second* ink: terra's
                relative luminance is 0.2428, which caps a 4.5:1 ink at
                luminance 0.0151, and --color-wrapped-ink already sits there.
                So the hierarchy is size, weight, case and font only — which
                is all it ever really was. */}
            <p className="text-[11.5px] font-extrabold tracking-[0.14em] uppercase">
              {slide.eyebrow}
            </p>
          </div>

          <div>
            <span aria-hidden="true" className="mb-3 block text-5xl">
              {slide.emoji}
            </span>

            {/* Plain text: the headline can contain a host-authored class
                name, so it must never be interpreted as markup. */}
            <h2 className="font-display text-[clamp(30px,9vw,44px)] leading-[1.05]">
              {slide.headline}
            </h2>

            <p className="mt-3 text-[15px] font-bold">{slide.detail}</p>
          </div>

          <p className="font-hand text-lg">Maison Abeer</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-latte text-sm">
          {index + 1} of {slides.length} · tap to move
        </p>

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setIndex(0)}>
            Start over
          </Button>
          <Button size="sm" onClick={() => toast('Screenshot it — already story-shaped 📲')}>
            Share
          </Button>
        </div>
      </div>
    </div>
  );
}
