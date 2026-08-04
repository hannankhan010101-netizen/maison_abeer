'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

/**
 * Buttons.
 *
 * Filled variants use `--color-on-rose` / `--color-on-pink` (cocoa ink), not
 * white. The prototype's white-on-pastel measured 2.62:1 and 1.86:1 against
 * the PRD's 4.5:1 requirement — see docs/adr/0002.
 *
 * Every variant is at least 44px tall so it stays usable with clay-dusted
 * fingers (PRD §3.4).
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a pending state and blocks repeat submits. */
  loading?: boolean;
  loadingLabel?: string;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-rose text-on-rose shadow-[0_8px_18px_-8px_var(--color-rose)] hover:brightness-105',
  secondary: 'bg-paper text-cocoa border-[1.5px] border-line hover:border-pink',
  ghost: 'bg-blush text-rose-ink hover:brightness-95',
  danger: 'bg-danger-soft text-danger border-[1.5px] border-danger-line hover:brightness-95',
};

const SIZES: Record<ButtonSize, string> = {
  // Both clear 44px; `sm` trades horizontal padding, never height.
  sm: 'min-h-[44px] px-3.5 text-[13px]',
  md: 'min-h-[44px] px-[18px] text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingLabel,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-[7px]',
        'rounded-[var(--radius-pill)] font-extrabold',
        'transition-[transform,filter,background-color] duration-150',
        'hover:-translate-y-0.5 active:translate-y-0',
        // Motion is decoration; never let it be the only affordance.
        'motion-reduce:transform-none motion-reduce:transition-none',
        'disabled:pointer-events-none disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
});
