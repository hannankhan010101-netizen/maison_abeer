import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * The dashboard alert feed (PRD §2.1).
 *
 * Two priority tiers: critical alerts render in terracotta and pin to the top,
 * gentle nudges render in soft pastel below. Every alert is actionable — an
 * alert with nothing to do about it is just noise.
 *
 * Critical items get `role="alert"` so assistive tech announces them; nudges
 * stay silent to avoid interrupting the host for something gentle.
 */

export type AlertTone = 'critical' | 'warning' | 'gentle';

export interface AlertCardProps {
  tone?: AlertTone;
  title: string;
  description?: ReactNode;
  /** Emoji or icon. Decorative — the title carries the meaning. */
  icon?: ReactNode;
  /** The resolving action. Alerts should always offer one. */
  action?: ReactNode;
  className?: string;
}

const BORDER_BY_TONE: Record<AlertTone, string> = {
  critical: 'border-l-terra',
  warning: 'border-l-butter',
  gentle: 'border-l-sage',
};

export function AlertCard({
  tone = 'gentle',
  title,
  description,
  icon,
  action,
  className,
}: AlertCardProps) {
  return (
    <div
      role={tone === 'critical' ? 'alert' : undefined}
      className={cn(
        'flex flex-wrap items-start gap-3 sm:flex-nowrap',
        'border-line bg-paper rounded-[var(--radius-md)] border-[1.5px] border-l-[5px]',
        'px-4 py-3.5',
        BORDER_BY_TONE[tone],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="text-base leading-6">
          {icon}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <b className="block">{title}</b>
        {description ? <small className="text-latte">{description}</small> : null}
      </div>

      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}
