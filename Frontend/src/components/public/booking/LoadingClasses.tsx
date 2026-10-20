'use client';

export function LoadingClasses() {
  return (
    <div aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading classes</span>
      <ul className="grid gap-3">
        {[0, 1, 2].map((key) => (
          <li
            key={key}
            className="border-line bg-blush/40 h-28 animate-pulse rounded-[var(--radius-md)] border-[1.5px] motion-reduce:animate-none"
          />
        ))}
      </ul>
    </div>
  );
}
