'use client';

import { useEffect, useMemo, useState } from 'react';

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
  nameFontSize,
  pageCount,
  themeById,
  themeForColorToken,
  unassignedNames,
  type LayoutId,
  type TagData,
  type TagOptions,
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
  const [layout, setLayout] = useState<LayoutId>('a4-8');
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
      <h1 className="font-display text-[clamp(26px,4vw,34px)]">Name tag studio</h1>
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
  options,
  loading = false,
}: {
  tags: TagData[];
  theme: ThemeId;
  options: TagOptions;
  loading?: boolean;
}) {
  const resolved = themeById(theme);

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
    <div className="border-latte bg-paper rounded-[var(--radius-md)] border-[1.5px] border-dashed p-5">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3.5">
        {tags.map((tag) => (
          <li key={tag.id}>
            <article
              className={cn(
                'relative min-h-32 rounded-2xl border-[1.5px] px-3.5 pt-4 pb-3',
                resolved.tagClass,
              )}
            >
              {resolved.ornament ? (
                <span aria-hidden="true" className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  {resolved.ornament}
                </span>
              ) : null}

              <span className="text-[10px] font-extrabold tracking-[0.14em] uppercase opacity-65">
                Hello, i&rsquo;m
              </span>

              {/* Type scales down rather than wrapping (PRD §2.3). */}
              <div
                className="font-display leading-tight"
                style={{ fontSize: `${nameFontSize(tag.name)}px` }}
              >
                {tag.name}
              </div>

              {tag.subtext ? <div className="font-hand text-base">{tag.subtext}</div> : null}

              {tag.tableNumber !== null ? (
                <span className="mt-2 inline-block rounded-[var(--radius-pill)] bg-white/60 px-2 py-0.5 text-[11px] font-extrabold">
                  table {tag.tableNumber}
                </span>
              ) : null}

              {options.showQrCode ? (
                <span
                  aria-hidden="true"
                  className="absolute right-3 bottom-3 grid size-6 grid-cols-5 gap-px opacity-80"
                >
                  {Array.from({ length: 25 }, (_, index) => (
                    <i
                      key={index}
                      className={cn(
                        'rounded-[1px]',
                        index % 3 === 0 ? 'bg-transparent' : 'bg-current',
                      )}
                    />
                  ))}
                </span>
              ) : null}
            </article>
          </li>
        ))}
      </ul>
    </div>
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
