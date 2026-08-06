'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, CardTitle, Eyebrow, HandNote } from '@/components/ui/Card';
import { Field, inputClasses } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/errors';
import { useBrandKit, useSettings, useUpdateBrandKit, useUpdateSettings } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { VOICES } from '@/lib/messages/voices';
import type { StudioSettings } from '@/lib/api/types';

/**
 * Studio settings.
 *
 * Everything here changes how the rest of the app behaves — quiet hours gate
 * every guest message, rest days and the weekly cap drive the energy
 * warnings, and the voice sets the tone of every template. Until this screen
 * existed those were fixed at their defaults with no way to change them.
 */

const DAYS = [
  { iso: 1, label: 'mon' },
  { iso: 2, label: 'tue' },
  { iso: 3, label: 'wed' },
  { iso: 4, label: 'thu' },
  { iso: 5, label: 'fri' },
  { iso: 6, label: 'sat' },
  { iso: 7, label: 'sun' },
] as const;

export function SettingsForm() {
  const { toast } = useToast();
  const settings = useSettings();
  const brandKit = useBrandKit();
  const updateSettings = useUpdateSettings();
  const updateBrandKit = useUpdateBrandKit();

  const [draft, setDraft] = useState<StudioSettings | null>(null);
  const [handle, setHandle] = useState('');

  // Seed the form once the server answers; afterwards the draft is the source
  // of truth so typing is never overwritten by a background refetch.
  useEffect(() => {
    if (settings.data && draft === null) setDraft(settings.data);
  }, [settings.data, draft]);

  useEffect(() => {
    if (brandKit.data) setHandle(brandKit.data.instagram_handle ?? '');
  }, [brandKit.data]);

  if (settings.isError) {
    return (
      <Card>
        <div role="alert">
          <p className="font-bold">
            {settings.error instanceof ApiError
              ? settings.error.displayMessage
              : "We couldn't load your settings."}
          </p>
          <Button variant="ghost" className="mt-3" onClick={() => void settings.refetch()}>
            try again
          </Button>
        </div>
      </Card>
    );
  }

  if (!draft) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading your settings…</span>
        <div
          aria-hidden="true"
          className="border-line h-64 rounded-[var(--radius-lg)] border-[1.5px] border-dashed"
        />
      </div>
    );
  }

  function patch(changes: Partial<StudioSettings>) {
    setDraft((current) => (current ? { ...current, ...changes } : current));
  }

  function toggleRestDay(iso: number) {
    if (!draft) return;

    const next = draft.rest_days.includes(iso)
      ? draft.rest_days.filter((day) => day !== iso)
      : [...draft.rest_days, iso].sort();

    patch({ rest_days: next });
  }

  async function save() {
    if (!draft) return;

    try {
      await updateSettings.mutateAsync({
        timezone: draft.timezone,
        quiet_hours_start: draft.quiet_hours_start,
        quiet_hours_end: draft.quiet_hours_end,
        weekly_class_cap: draft.weekly_class_cap,
        rest_days: draft.rest_days,
        default_voice: draft.default_voice,
        emoji_density: draft.emoji_density,
        show_greeting: draft.show_greeting,
      });

      await updateBrandKit.mutateAsync({ instagram_handle: handle.trim() || null });

      toast('settings saved ✨');
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.displayMessage : "We couldn't save that.", 'error');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle>quiet hours</CardTitle>
        <p className="text-latte mt-1 mb-3 text-[13.5px]">
          guest messages only send inside this window. anything triggered outside it waits for the
          next opening — nobody gets invited to a class at 3am.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="from" htmlFor="quiet-start">
            <input
              id="quiet-start"
              type="time"
              value={draft.quiet_hours_start.slice(0, 5)}
              onChange={(event) => patch({ quiet_hours_start: `${event.target.value}:00` })}
              className={inputClasses}
            />
          </Field>

          <Field label="until" htmlFor="quiet-end">
            <input
              id="quiet-end"
              type="time"
              value={draft.quiet_hours_end.slice(0, 5)}
              onChange={(event) => patch({ quiet_hours_end: `${event.target.value}:00` })}
              className={inputClasses}
            />
          </Field>
        </div>

        <Field
          label="studio timezone"
          htmlFor="timezone"
          hint="all class times are read in this zone"
        >
          <input
            id="timezone"
            value={draft.timezone}
            onChange={(event) => patch({ timezone: event.target.value })}
            className={inputClasses}
            list="timezones"
          />
          <datalist id="timezones">
            {[Intl.DateTimeFormat().resolvedOptions().timeZone, 'UTC', 'Asia/Karachi'].map(
              (zone) => (
                <option key={zone} value={zone} />
              ),
            )}
          </datalist>
        </Field>
      </Card>

      <Card>
        <CardTitle>your energy</CardTitle>
        <p className="text-latte mt-1 mb-3 text-[13.5px]">
          these only ever ask — nothing here blocks you from scheduling.
        </p>

        <Eyebrow>rest days</Eyebrow>
        <div role="group" aria-label="Rest days" className="mb-4 flex flex-wrap gap-1.5">
          {DAYS.map((day) => {
            const active = draft.rest_days.includes(day.iso);

            return (
              <button
                key={day.iso}
                type="button"
                onClick={() => toggleRestDay(day.iso)}
                aria-pressed={active}
                className={cn(
                  'min-h-[44px] rounded-[var(--radius-pill)] border-[1.5px] px-3.5 text-xs font-extrabold',
                  active ? 'border-pink bg-pink text-on-pink' : 'border-line bg-paper text-latte',
                )}
              >
                {day.label}
              </button>
            );
          })}
        </div>

        <Field
          label="classes per week you're happy with"
          htmlFor="weekly-cap"
          hint="leave empty for no gentle nudge"
        >
          <input
            id="weekly-cap"
            type="number"
            min={1}
            max={50}
            value={draft.weekly_class_cap ?? ''}
            onChange={(event) =>
              patch({ weekly_class_cap: event.target.value ? Number(event.target.value) : null })
            }
            className={inputClasses}
          />
        </Field>
      </Card>

      <Card>
        <CardTitle>your voice</CardTitle>
        <p className="text-latte mt-1 mb-3 text-[13.5px]">
          the default tone for every guest message. you can still override it per message.
        </p>

        <div role="radiogroup" aria-label="Default voice" className="flex flex-wrap gap-2">
          {VOICES.map((voice) => {
            const active = draft.default_voice === voice.id;

            return (
              <button
                key={voice.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => patch({ default_voice: voice.id })}
                className={cn(
                  'min-h-[44px] rounded-[var(--radius-pill)] border-[1.5px] px-4 text-[13px] font-extrabold',
                  active ? 'border-rose bg-rose text-on-rose' : 'border-line bg-paper text-latte',
                )}
              >
                <span aria-hidden="true">{voice.icon}</span> {voice.label}
              </button>
            );
          })}
        </div>

        <Eyebrow className="mt-4">emoji</Eyebrow>
        <div role="radiogroup" aria-label="Emoji density" className="flex flex-wrap gap-2">
          {(['none', 'light', 'full'] as const).map((density) => (
            <button
              key={density}
              type="button"
              role="radio"
              aria-checked={draft.emoji_density === density}
              onClick={() => patch({ emoji_density: density })}
              className={cn(
                'min-h-[44px] rounded-[var(--radius-pill)] border-[1.5px] px-4 text-xs font-extrabold',
                draft.emoji_density === density
                  ? 'border-pink bg-pink text-on-pink'
                  : 'border-line bg-paper text-latte',
              )}
            >
              {density}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>your studio</CardTitle>

        <Field
          label="instagram handle"
          htmlFor="instagram"
          hint="becomes the QR code on your name tags"
        >
          <input
            id="instagram"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder="@yourstudio"
            className={inputClasses}
          />
        </Field>

        <label className="border-line flex min-h-[44px] items-center justify-between gap-3 border-t-[1.5px] border-dashed pt-2 text-[13.5px] font-bold">
          show the greeting on my dashboard
          <input
            type="checkbox"
            checked={draft.show_greeting}
            onChange={(event) => patch({ show_greeting: event.target.checked })}
            className="accent-rose size-6"
          />
        </label>

        <p className="mt-2">
          <HandNote>some hosts prefer a plain header ♡</HandNote>
        </p>
      </Card>

      <div className="lg:col-span-2">
        <Button
          onClick={save}
          loading={updateSettings.isPending || updateBrandKit.isPending}
          loadingLabel="saving…"
        >
          save settings
        </Button>
      </div>
    </div>
  );
}
