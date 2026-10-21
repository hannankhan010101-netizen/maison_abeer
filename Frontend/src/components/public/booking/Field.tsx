'use client';

import { cn } from '@/lib/cn';

type FieldIcon = 'user' | 'phone' | 'mail' | 'heart' | 'sparkle';

function FieldIconGlyph({ icon }: { icon: FieldIcon }) {
  const common = {
    viewBox: '0 0 20 20',
    fill: 'none',
    'aria-hidden': true,
    className: 'size-[18px]',
  } as const;

  switch (icon) {
    case 'user':
      return (
        <svg {...common}>
          <circle cx="10" cy="6.5" r="3.25" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M3.5 17c1-3.6 4-5.5 6.5-5.5s5.5 1.9 6.5 5.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'phone':
      return (
        <svg {...common}>
          <path
            d="M6 3h2.2l1 3.2-1.6 1.4a9 9 0 0 0 4.8 4.8l1.4-1.6 3.2 1v2.2c0 .9-.8 1.6-1.7 1.5A13.5 13.5 0 0 1 4.5 4.7C4.4 3.8 5.1 3 6 3Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'mail':
      return (
        <svg {...common}>
          <path
            d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="m3.5 5.5 6.5 5 6.5-5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'heart':
      return (
        <svg {...common}>
          <path
            d="M10 16.5S3 12.3 3 7.8A3.3 3.3 0 0 1 10 6a3.3 3.3 0 0 1 7 1.8c0 4.5-7 8.7-7 8.7Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'sparkle':
      return (
        <svg {...common}>
          <path
            d="M10 3.5c.4 2.6 1.2 3.9 4 4.4-2.8.5-3.6 1.8-4 4.4-.4-2.6-1.2-3.9-4-4.4 2.8-.5 3.6-1.8 4-4.4Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M15.5 13c.2 1.4.6 2 1.9 2.3-1.3.3-1.7 1-1.9 2.3-.2-1.4-.6-2-1.9-2.3 1.3-.3 1.7-1 1.9-2.3Z"
            fill="currentColor"
          />
        </svg>
      );
  }
}

export function Field({
  id,
  name,
  label,
  hint,
  invalid,
  required,
  icon,
  ...input
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  invalid?: boolean;
  required?: boolean;
  icon: FieldIcon;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-extrabold">
        {label}
        {required ? null : <span className="text-latte font-normal"> · optional</span>}
      </label>

      {hint ? (
        <p id={hintId} className="text-latte mb-1 text-xs">
          {hint}
        </p>
      ) : null}

      <div className="relative">
        <span className="text-latte pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
          <FieldIconGlyph icon={icon} />
        </span>

        <input
          {...input}
          id={id}
          name={name}
          aria-describedby={hintId}
          aria-invalid={invalid || undefined}
          className={cn(
            'bg-paper text-cocoa min-h-[48px] w-full rounded-[var(--radius-sm)] border-[1.5px] py-2.5 pr-3 pl-10 shadow-[inset_0_2px_4px_rgb(64_48_42_/_8%)]',
            'transition-[border-color,box-shadow] duration-150',
            'focus-visible:border-rose focus-visible:shadow-[inset_0_0_0_1px_var(--color-rose),inset_0_3px_8px_var(--color-blush)] focus-visible:outline-none',
            invalid ? 'border-danger' : 'border-line',
          )}
        />
      </div>
    </div>
  );
}
