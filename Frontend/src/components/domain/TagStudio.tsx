'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { SessionPicker } from '@/components/domain/SessionPicker';
import { AlertCard } from '@/components/ui/AlertCard';
import { Button } from '@/components/ui/Button';
import { Card, Eyebrow, HandNote } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useRecordExport, useRoster, useSessions, useTagSheet } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { useResolvedNow } from '@/lib/useNow';
import { addWeeks } from '@/lib/dates';
import {
  LAYOUTS,
  THEMES,
  buildTags,
  layoutById,
  nameFontSize,
  pageCount,
  themeById,
  themeForColorToken,
  unassignedNames,
  type LayoutId,
  type TagData,
  type TagLayout,
  type TagOptions,
  type TagTheme,
  type ThemeId,
} from '@/lib/tags/themes';

/**
 * The name tag studio (PRD §2.3).
 *
 * Booking data in, print-ready sheet out, in under three minutes. The preview
 * is the product — a host should be able to see exactly what will print
 * before committing paper to it.
 */

export interface TagStudioProps {
  now?: Date;
}

export function TagStudio({ now: nowProp }: TagStudioProps) {
  const now = useResolvedNow(nowProp);

  if (!now) return <TimeGateSkeleton />;

  return <TagStudioInner now={now} />;
}

function TagStudioInner({ now }: { now: Date }) {
  const range = useMemo(
    () => ({ start: now.toISOString(), end: addWeeks(now, 4).toISOString() }),
    [now],
  );

  const sessions = useSessions(range.start, range.end);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const selected = useMemo(
    () => sessions.data?.find((session) => session.id === sessionId) ?? sessions.data?.[0],
    [sessions.data, sessionId],
  );

  const roster = useRoster(selected?.id ?? '', Boolean(selected));

  // The sheet carries the server's fingerprint of what was last printed. It
  // is the authority on staleness: comparing timestamps would raise the
  // banner for edits that never reach a tag, and stay quiet for ones that do.
  const sheet = useTagSheet(selected?.id ?? '', Boolean(selected));
  const recordExport = useRecordExport(selected?.id ?? '');

  const [theme, setTheme] = useState<ThemeId | null>(null);
  const [layout, setLayout] = useState<LayoutId>('stand-a4-6');
  const [options, setOptions] = useState<TagOptions>({
    showTableNumber: true,
    showSubtext: true,
    showQrCode: true,
  });

  // Preselect the theme matching the class's craft colour, until the host
  // picks one themselves — then leave their choice alone.
  const activeTheme = theme
    ? themeById(theme)
    : themeForColorToken(selected?.color_token ?? 'pink');

  useEffect(() => {
    setTheme(null);
  }, [selected?.id]);

  const tags = useMemo(
    () => buildTags(roster.data?.bookings ?? [], options),
    [roster.data, options],
  );

  const missingTables = unassignedNames(tags, options.showTableNumber);

  return (
    <section>
      <h1 className="font-display text-[clamp(21px,4vw,34px)]">Name tag studio</h1>
      <p className="text-latte mb-4">
        <HandNote>Whole event kit in one click ✂️</HandNote>
      </p>

      <SessionPicker
        sessions={sessions.data ?? []}
        value={selected?.id ?? null}
        onChange={setSessionId}
      />

      {sessions.isSuccess && (sessions.data?.length ?? 0) === 0 ? (
        <Card>
          <p className="font-display py-4 text-center text-lg">No upcoming classes</p>
          <p className="text-latte text-center text-sm">
            Schedule one and its tags will be ready here
          </p>
        </Card>
      ) : null}

      {selected ? (
        <>
          {(sheet.data?.roster_changed_since_export ?? selected.roster_changed_since_export) ? (
            <AlertCard
              className="mb-4"
              tone="critical"
              icon="🏷️"
              title="Roster updated since your last export"
              description="re-export so the printed set matches who's coming"
            />
          ) : null}

          {missingTables.length > 0 ? (
            <AlertCard
              className="mb-4"
              tone="warning"
              icon="🪑"
              title={`${missingTables.length} guest${missingTables.length === 1 ? '' : 's'} without a table`}
              description={`${missingTables.join(', ')} — assign them, or hide table numbers for this batch`}
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div>
              <Eyebrow>Theme</Eyebrow>
              <ul className="mb-4 grid gap-2">
                {THEMES.map((option) => {
                  const active = option.id === activeTheme.id;

                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() => setTheme(option.id)}
                        aria-pressed={active}
                        className={cn(
                          'flex min-h-[44px] w-full items-center gap-3 rounded-[var(--radius-md)]',
                          'bg-paper border-[1.5px] px-3 py-2.5 text-left',
                          active
                            ? 'border-rose shadow-[0_0_0_3px_var(--color-blush)]'
                            : 'border-line',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn('size-9 shrink-0 rounded-xl', option.swatch)}
                        />
                        <span className="min-w-0">
                          <b className="block text-[13.5px]">{option.label}</b>
                          <small className="text-latte text-[11.5px]">{option.description}</small>
                        </span>
                        {option.seasonal ? <Chip tone="butter">NEW</Chip> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <Card className="p-3.5">
                <Eyebrow>Show on tags</Eyebrow>
                <Toggle
                  label="Table number"
                  checked={options.showTableNumber}
                  onChange={(v) => setOptions((o) => ({ ...o, showTableNumber: v }))}
                />
                <Toggle
                  label="Fun subtext"
                  checked={options.showSubtext}
                  onChange={(v) => setOptions((o) => ({ ...o, showSubtext: v }))}
                />
                <Toggle
                  label="Instagram QR"
                  checked={options.showQrCode}
                  onChange={(v) => setOptions((o) => ({ ...o, showQrCode: v }))}
                />

                <div className="mt-3">
                  <label
                    htmlFor="layout"
                    className="text-latte mb-1.5 block text-[11.5px] font-extrabold tracking-[0.14em] uppercase"
                  >
                    Layout
                  </label>
                  <select
                    id="layout"
                    value={layout}
                    onChange={(event) => setLayout(event.target.value as LayoutId)}
                    className="border-line bg-buttercream text-cocoa min-h-[44px] w-full rounded-[var(--radius-sm)] border-[1.5px] px-3 text-sm"
                  >
                    {LAYOUTS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </Card>
            </div>

            <div>
              <TagSheet
                tags={tags}
                theme={activeTheme.id}
                layout={layout}
                options={options}
                loading={roster.isPending}
              />

              <div className="mt-3.5 flex flex-wrap items-center gap-3">
                <Button
                  disabled={tags.length === 0 || recordExport.isPending}
                  onClick={() => {
                    // Print first, record second. The stored fingerprint has
                    // to describe what actually reached paper — recording up
                    // front would clear the staleness banner even if the host
                    // cancelled the print dialog.
                    window.print();
                    recordExport.mutate({ theme: activeTheme.id, layout });
                  }}
                >
                  Export print PDF ⤓
                </Button>
                <HandNote>
                  {tags.length} tag{tags.length === 1 ? '' : 's'} · {pageCount(tags.length, layout)}{' '}
                  page
                  {pageCount(tags.length, layout) === 1 ? '' : 's'} · trim marks included
                  {layoutById(layout).foldable ? ' · cut, then fold along the dashes' : null}
                </HandNote>
              </div>

              <Eyebrow className="mt-5">Matching event kit</Eyebrow>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { icon: '🪧', label: 'Welcome sign', note: 'A4 / A3' },
                  {
                    icon: '🔢',
                    label: 'Table cards',
                    note: `×${new Set(tags.map((t) => t.tableNumber).filter(Boolean)).size || 0}`,
                  },
                  { icon: '📱', label: 'Story templates', note: '×3' },
                ].map((piece) => (
                  <li key={piece.label}>
                    <Card className="p-3.5 text-center text-xs font-extrabold">
                      <span aria-hidden="true" className="mb-1 block text-2xl">
                        {piece.icon}
                      </span>
                      {piece.label}
                      <small className="text-latte mt-0.5 block font-bold">{piece.note}</small>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="border-line flex min-h-[44px] items-center justify-between gap-3 border-b-[1.5px] border-dashed text-[13.5px] font-bold last:border-b-0">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-rose size-6 shrink-0"
      />
    </label>
  );
}

export function TagSheet({
  tags,
  theme,
  layout,
  options,
  loading = false,
}: {
  tags: TagData[];
  theme: ThemeId;
  layout: LayoutId;
  options: TagOptions;
  loading?: boolean;
}) {
  const resolved = themeById(theme);
  const resolvedLayout = layoutById(layout);

  if (loading) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading the roster…</span>
        <div
          aria-hidden="true"
          className="border-latte h-64 rounded-[var(--radius-md)] border-[1.5px] border-dashed"
        />
      </div>
    );
  }

  if (tags.length === 0) {
    return (
      <Card>
        <p className="text-latte py-6 text-center text-sm">
          No guests booked yet — tags appear as people join
        </p>
      </Card>
    );
  }

  return (
    <div className="border-latte bg-paper rounded-[var(--radius-md)] border-[1.5px] border-dashed p-5 print:rounded-none print:border-0 print:bg-white print:p-0">
      <ul
        className="tag-sheet grid grid-cols-[repeat(auto-fill,minmax(188px,1fr))] gap-4"
        // Read by the print stylesheet, which lays the sheet out in the
        // layout's own column count rather than whatever fits the screen.
        style={{ '--tag-columns': resolvedLayout.columns } as CSSProperties}
      >
        {tags.map((tag) => (
          <li key={tag.id}>
            <TagCard tag={tag} theme={resolved} layout={resolvedLayout} options={options} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One standing card: face, scored fold line, flap.
 *
 * The flap is the whole point — fold it back along the crease and the card
 * stands up on the table instead of lying face-down where nobody can read
 * it. It is tinted a shade deeper than the face so the crease is findable at
 * a glance on a stack of forty, and it is tall enough to carry the card's
 * weight at roughly a right angle.
 */
function TagCard({
  tag,
  theme,
  layout,
  options,
}: {
  tag: TagData;
  theme: TagTheme;
  layout: TagLayout;
  options: TagOptions;
}) {
  const nameSize = nameFontSize(tag.name);

  return (
    <article
      className={cn(
        'tag-card relative overflow-hidden rounded-[18px] border-[1.5px]',
        'shadow-[0_6px_16px_-12px_rgb(64_48_42/0.45)] print:shadow-none',
        theme.tagClass,
      )}
      style={{ aspectRatio: `${layout.faceMm.width} / ${layout.faceMm.height + layout.flapMm}` }}
    >
      {/* A hairline inset keyline — the thing that reads as "printed", not "boxed". */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[5px] rounded-[13px] border border-current opacity-[0.18]"
      />

      <TrimMarks />

      <div className="relative flex h-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col justify-center px-4 py-3">
          {theme.ornament ? (
            <span aria-hidden="true" className="absolute top-2.5 right-3 text-[15px] opacity-80">
              {theme.ornament}
            </span>
          ) : null}

          <span className="text-[9.5px] font-extrabold tracking-[0.2em] uppercase opacity-70">
            Hello, I&rsquo;m
          </span>

          {/* Type scales down rather than wrapping (PRD §2.3). */}
          <div className="font-display mt-0.5 leading-[1.08]" style={{ fontSize: `${nameSize}px` }}>
            {tag.name}
          </div>

          <span
            aria-hidden="true"
            className={cn('mt-1.5 block h-[2px] w-9 rounded-full', theme.ruleClass)}
          />

          {tag.subtext ? (
            <div className="font-hand mt-1 text-[15px] leading-tight opacity-90">{tag.subtext}</div>
          ) : null}

          <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
            {tag.tableNumber !== null ? (
              <span
                className={cn(
                  'inline-block rounded-[var(--radius-pill)] border bg-white/70 px-2 py-0.5',
                  'text-[10.5px] font-extrabold tracking-wide',
                  theme.pillBorderClass,
                )}
              >
                table {tag.tableNumber}
              </span>
            ) : (
              <span />
            )}

            {options.showQrCode ? <QrPlaceholder /> : null}
          </div>
        </div>

        {layout.foldable ? <FoldFlap theme={theme} layout={layout} /> : null}
      </div>
    </article>
  );
}

/**
 * The crease and the flap below it.
 *
 * The dashed rule is the scoring line, and the two notches sitting on it at
 * either edge are what a pair of scissors aims at before folding — the same
 * convention a printed invitation uses.
 */
function FoldFlap({ theme, layout }: { theme: TagTheme; layout: TagLayout }) {
  return (
    <div
      aria-hidden="true"
      className={cn('relative shrink-0', theme.flapClass)}
      style={{ height: `${(layout.flapMm / (layout.faceMm.height + layout.flapMm)) * 100}%` }}
    >
      <span className="absolute inset-x-0 top-0 border-t-[1.5px] border-dashed border-current opacity-40" />
      <span className="absolute top-0 left-0 h-px w-2 -translate-y-px bg-current opacity-70" />
      <span className="absolute top-0 right-0 h-px w-2 -translate-y-px bg-current opacity-70" />

      <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[8px] font-extrabold tracking-[0.18em] uppercase opacity-45">
        fold back to stand
      </span>
    </div>
  );
}

/** Faint corner crosses to cut to — the "trim marks included" the UI promises. */
function TrimMarks() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30">
      {(['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'] as const).map(
        (corner) => (
          <span key={corner} className={cn('absolute size-2', corner)}>
            <i className="absolute top-1/2 h-px w-full bg-current" />
            <i className="absolute left-1/2 h-full w-px bg-current" />
          </span>
        ),
      )}
    </span>
  );
}

/**
 * Stand-in for the studio's Instagram QR.
 *
 * Deliberately not a real code: nothing here knows the studio's handle yet,
 * and printing a scannable code that leads nowhere is worse than printing an
 * obvious placeholder.
 */
function QrPlaceholder() {
  return (
    <span aria-hidden="true" className="grid size-7 shrink-0 grid-cols-6 gap-px opacity-70">
      {Array.from({ length: 36 }, (_, index) => (
        <i
          key={index}
          className={cn(
            'rounded-[0.5px]',
            index % 3 === 0 || index % 7 === 0 ? 'bg-transparent' : 'bg-current',
          )}
        />
      ))}
    </span>
  );
}

/** Stable placeholder until the client's clock is known (lib/useNow.ts). */
function TimeGateSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div
        aria-hidden="true"
        className="border-line h-48 rounded-[var(--radius-lg)] border-[1.5px] border-dashed"
      />
    </div>
  );
}
