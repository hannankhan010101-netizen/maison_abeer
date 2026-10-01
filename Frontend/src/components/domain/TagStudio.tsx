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
  cardSheetMm,
  isFoldable,
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
                  {isFoldable(layoutById(layout)) ? ' · cut, then fold in half' : null}
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
 * One tent card: back panel, crease, front face.
 *
 * Printed as a double-height sheet and folded once across the middle, so the
 * card becomes a self-supporting triangle — the shape a place card has to be
 * to survive a workshop bench. A shallow fold-back flap was tried first and
 * is the wrong mechanism: it props the card at too steep an angle and tips at
 * the first nudge of the table.
 *
 * The back panel prints rotated 180°, which is the old tent-card trick. Fold
 * the top half backwards and its top edge becomes the bottom edge, so
 * anything set the right way up there ends up upside down to someone standing
 * behind the table.
 *
 * The name is on the front only. A tent folds for structure here, not to be
 * read from both sides: the guest sits behind their own card, and the room
 * reads the front.
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
  const sheet = cardSheetMm(layout);
  const tent = layout.fold === 'tent';

  return (
    <article
      className={cn(
        'tag-card relative overflow-hidden rounded-[18px] border-[1.5px]',
        'shadow-[0_6px_16px_-12px_rgb(64_48_42/0.45)] print:shadow-none',
        theme.tagClass,
      )}
      style={{ aspectRatio: `${sheet.width} / ${sheet.height}` }}
    >
      <TrimMarks />

      <div className="relative flex h-full flex-col">
        {tent ? <TentBackPanel theme={theme} /> : null}
        {tent ? <Crease /> : null}

        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* A pale bloom behind the name, so the type sits on light rather
              than on flat colour. Kept faint enough to survive a cheap inkjet
              without banding. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_15%,rgb(255_255_255/0.55),transparent_70%)]"
          />

          {/* Double keyline: a hairline edge with a dotted inner rule. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[5px] rounded-[12px] border border-current opacity-[0.16]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[9px] rounded-[9px] border border-dotted border-current opacity-[0.14]"
          />

          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-3 text-center">
            <span className="text-[9px] font-extrabold tracking-[0.26em] uppercase opacity-65">
              Hello, I&rsquo;m
            </span>

            {/* Type scales down rather than wrapping (PRD §2.3). */}
            <div
              className="font-display mt-1 leading-[1.06]"
              style={{ fontSize: `${nameFontSize(tag.name)}px` }}
            >
              {tag.name}
            </div>

            <OrnamentDivider theme={theme} />

            {tag.subtext ? (
              <div className="font-hand text-[15px] leading-tight opacity-90">{tag.subtext}</div>
            ) : null}
          </div>

          <div className="relative flex items-end justify-between gap-2 px-3.5 pb-2.5">
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
      </div>
    </article>
  );
}

/**
 * The upper half of the sheet, which becomes the rear leg of the tent.
 *
 * Rotated 180° so it reads upright from behind the table once folded, and
 * kept near-empty on purpose: this panel is the back of a place card, and the
 * only thing worth putting there is whose studio it is.
 */
function TentBackPanel({ theme }: { theme: TagTheme }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative flex flex-1 rotate-180 items-center justify-center',
        theme.backPanelClass,
      )}
    >
      <span className="text-center">
        <span className="block text-[8.5px] font-extrabold tracking-[0.3em] uppercase opacity-45">
          Maison Abeer
        </span>
        {theme.ornament ? (
          <span className="mt-0.5 block text-[11px] opacity-50">{theme.ornament}</span>
        ) : null}
      </span>

      <span className="absolute inset-x-0 bottom-1 text-center text-[7.5px] font-bold tracking-[0.2em] uppercase opacity-35">
        fold here
      </span>
    </div>
  );
}

/** The scoring line the card is folded along, notched at both edges. */
function Crease() {
  return (
    <span aria-hidden="true" className="relative block h-0 shrink-0">
      <span className="absolute inset-x-0 top-0 border-t-[1.5px] border-dashed border-current opacity-40" />
      <span className="absolute top-0 left-0 h-px w-2.5 -translate-y-px bg-current opacity-70" />
      <span className="absolute top-0 right-0 h-px w-2.5 -translate-y-px bg-current opacity-70" />
    </span>
  );
}

/** A small centred glyph between two rules — a place card, not a label. */
function OrnamentDivider({ theme }: { theme: TagTheme }) {
  return (
    <span aria-hidden="true" className="my-1.5 flex items-center gap-1.5">
      <i className={cn('block h-[1.5px] w-5 rounded-full', theme.ruleClass)} />
      <i className="block text-[8px] opacity-55">{theme.ornament ?? '·'}</i>
      <i className={cn('block h-[1.5px] w-5 rounded-full', theme.ruleClass)} />
    </span>
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
