import { isDemoMode } from '@/lib/demo/enabled';

/**
 * Demo-mode banner.
 *
 * Deliberately impossible to miss. Someone looking at seeded data must never
 * believe they are looking at their studio's real bookings — especially on a
 * screen showing guest allergies.
 */
export function DemoBanner() {
  if (!isDemoMode()) return null;

  return (
    <div
      role="status"
      className="border-butter bg-butter-soft text-butter-ink border-b-[1.5px] px-4 py-2 text-center text-xs font-extrabold"
    >
      demo mode · sample data, nothing here is real · sign-in is bypassed
    </div>
  );
}
