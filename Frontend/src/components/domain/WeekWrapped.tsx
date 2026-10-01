'use client';

import { Card, Eyebrow } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import type { Session } from '@/lib/api/types';

/**
 * "Your Week, Wrapped" (PRD §2.1).
 *
 * A tall, screenshot-friendly card that makes the host feel proud of their
 * week rather than merely informed about it — the PRD tracks how often these
 * get shared as a success metric, so it is designed to be photographed.
 */

export interface WeekStats {
  classesHosted: number;
  guestsTaught: number;
  soldOut: number;
  totalGuestsEver: number;
}

/**
 * Derive the week from sessions that have already finished.
 *
 * Counting classes still to come would tell the host they hosted something
 * they have not yet taught.
 */
export function summariseWeek(sessions: Session[], now: Date): WeekStats {
  const finished = sessions.filter((session) => new Date(session.ends_at) <= now);

  return {
    classesHosted: finished.length,
    guestsTaught: finished.reduce((total, session) => total + session.capacity.booked, 0),
    soldOut: finished.filter((session) => session.capacity.state === 'sold_out').length,
    totalGuestsEver: sessions.reduce((total, session) => total + session.capacity.booked, 0),
  };
}

/** Milestones worth celebrating, earned from the week's numbers. */
export function badgesFor(stats: WeekStats): string[] {
  const badges: string[] = [];

  if (stats.soldOut > 0) badges.push(`🎀 sold out ×${stats.soldOut}`);
  if (stats.totalGuestsEver >= 100) badges.push('🌷 100th guest');
  if (stats.classesHosted >= 3) badges.push('🔥 busy week');
  if (stats.guestsTaught >= 20) badges.push('✨ full house');

  return badges;
}

export function WeekWrapped({ stats }: { stats: WeekStats }) {
  // Nothing finished yet — a recap of zeros is not a celebration.
  if (stats.classesHosted === 0) return null;

  const badges = badgesFor(stats);

  return (
    <div>
      <div
        className={cn(
          'rounded-[var(--radius-lg)] p-[5px] shadow-[var(--shadow-soft)]',
          'bg-[linear-gradient(140deg,var(--color-pink)_0%,var(--color-butter)_55%,var(--color-sage)_110%)]',
          '-rotate-[1.3deg]',
        )}
      >
        {/* Same ink token as the story card in StudioWrapped: this card is a
            screenshot artifact too, its gradient is built from pink/butter/sage
            (shared across themes, so it never flips), and one card wants one
            ink rather than a literal hex per component. */}
        <div className="relative rounded-[18px] border-2 border-dashed border-white/75 p-5 text-[var(--color-wrapped-ink)]">
          <span
            aria-hidden="true"
            // Inherits the panel's ink rather than setting `text-white`: ADR 0002
            // struck white-on-pastel from the whole palette (white on --pink was
            // 1.86:1), and the 140deg axis puts this corner at ~52% of the ramp,
            // i.e. on --butter, where white is 1.34:1. `-top-3.5` also overhangs
            // the 5px gradient border onto the page background, where white is
            // 1.05:1. The inherited ink measures 8.77:1 on pink, 12.16:1 on
            // butter, 8.22:1 on sage. Caveat at 18px is not bold, so the bar is
            // 4.5:1, not 3:1. `drop-shadow` stays for the sticker feel; a blurred
            // halo contributes nothing measurable either way.
            className="font-hand absolute -top-3.5 right-3.5 rotate-3 text-lg drop-shadow"
          >
            Screenshot me! →
          </span>

          <h3 className="font-display mb-3 text-xl">Your week, wrapped 🎀</h3>

          <dl className="grid grid-cols-2 gap-2.5">
            <Stat value={stats.classesHosted} label="Classes hosted" />
            <Stat value={stats.guestsTaught} label="Guests taught" />
            <Stat value={stats.soldOut} label="Sold-out classes" />
            <Stat value={stats.totalGuestsEver} label="Guests all together" />
          </dl>

          {stats.totalGuestsEver > 0 ? (
            <p className="mt-3 text-[13.5px] font-extrabold">
              {stats.totalGuestsEver} people have now made something with you 💗
            </p>
          ) : null}
        </div>
      </div>

      {badges.length > 0 ? (
        <>
          <Eyebrow className="mt-4">Milestones</Eyebrow>
          <ul className="flex flex-wrap gap-2.5">
            {badges.map((badge, index) => (
              <li key={badge}>
                <Card
                  className={cn(
                    'px-3.5 py-2 text-[12.5px] font-extrabold',
                    index % 2 === 0 ? '-rotate-2' : 'rotate-1',
                  )}
                >
                  {badge}
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/**
 * One statistic.
 *
 * The value renders above the label visually but `dd` follows `dt` in the
 * DOM, so the pairing reads correctly. An `sr-only` copy of the label would
 * just make a screen reader say it twice.
 */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col-reverse rounded-2xl bg-[rgb(255_253_250/72%)] px-3 py-2.5">
      <dt className="text-xs font-extrabold">{label}</dt>
      <dd className="font-display text-2xl leading-tight font-bold">{value}</dd>
    </div>
  );
}
