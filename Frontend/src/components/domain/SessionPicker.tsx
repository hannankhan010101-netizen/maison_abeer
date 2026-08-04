'use client';

import { formatDateLong, formatTime } from '@/lib/dates';
import type { Session } from '@/lib/api/types';

/**
 * Choose which class a screen is working on.
 *
 * The tag studio, prep list and messages all operate on one session, and the
 * PRD's flows start from "the host selects an upcoming session" (§2.3).
 */

export interface SessionPickerProps {
  sessions: Session[];
  value: string | null;
  onChange: (sessionId: string) => void;
  label?: string;
}

export function SessionPicker({ sessions, value, onChange, label = 'Class' }: SessionPickerProps) {
  if (sessions.length === 0) return null;

  return (
    <div className="mb-4">
      <label
        htmlFor="session-picker"
        className="text-latte mb-1.5 block text-[11.5px] font-extrabold tracking-[0.14em] uppercase"
      >
        {label}
      </label>
      <select
        id="session-picker"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="border-line bg-paper text-cocoa min-h-[44px] w-full max-w-[420px] rounded-[var(--radius-sm)] border-[1.5px] px-3.5 text-sm"
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.title ?? session.class_type_name} · {formatDateLong(session.starts_at)}{' '}
            {formatTime(session.starts_at)}
          </option>
        ))}
      </select>
    </div>
  );
}
