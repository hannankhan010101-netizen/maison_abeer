'use client';

import { cn } from '@/lib/cn';

/**
 * The create action, put where the hand already is.
 *
 * Measured on a 375×812 phone, `+ Add a guest` sat at y=167 and
 * `+ new session` at y=265 — 480 and 580px from where a thumb rests while
 * holding a phone one-handed, which is the posture the PRD describes (a host
 * in the studio, clay on their hands). The bottom tab bar was built for that
 * reach; the actions those screens exist to perform were not.
 *
 * It *replaces* the header button below `lg` rather than joining it, so there
 * is one control with one accessible name rather than two of each. Above `lg`
 * the tab bar is gone, a pointer is available, and the header button is the
 * better affordance — so this hides and that returns.
 */

export interface FabProps {
  /** The accessible name — the same words the header button uses. */
  label: string;
  onClick: () => void;
  /** Decorative; the label carries the meaning. */
  icon?: string;
  className?: string;
}

export function Fab({ label, onClick, icon = '+', className }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        // Clears the tab bar and the home indicator by naming them, the same
        // way the toast and the "More" sheet do.
        'fixed right-4 bottom-[calc(var(--tab-bar-host)+env(safe-area-inset-bottom)+1rem)]',
        // Below the tab bar's own layer, so opening "More" covers it.
        'z-30 lg:hidden',
        'bg-rose text-on-rose grid size-14 place-items-center rounded-full',
        'text-2xl leading-none font-extrabold shadow-[0_10px_24px_-8px_var(--color-rose)]',
        // A tap that overshoots by a hair and settles reads as landing.
        'transition-transform duration-150 [transition-timing-function:var(--ease-spring)]',
        'active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100',
        'focus-visible:outline-cocoa focus-visible:outline-[3px] focus-visible:outline-offset-2',
        className,
      )}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}
