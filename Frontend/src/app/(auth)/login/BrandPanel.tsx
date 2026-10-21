import { HandNote } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

/**
 * A little slice of what's on the other side of this door — the bento cake
 * class card is fictional but shaped exactly like a real one (PRD §2.1), so
 * this reads as "the product," not a stock illustration.
 */
function ShowcaseCard() {
  return (
    <div
      className={cn(
        'border-line bg-paper/80 animate-rise-in w-[248px] rounded-[var(--radius-lg)] border-[1.5px]',
        'p-4 shadow-[var(--shadow-soft)] backdrop-blur-md',
      )}
      style={{ animationDelay: '150ms' }}
      aria-hidden="true"
    >
      {/* Named as an example: the numbers on this card are an illustration of
          the product, and the page says so rather than letting them pass as data. */}
      <p className="font-hand text-latte -mt-1 mb-2 text-sm">for example</p>
      <div className="flex items-center justify-between">
        <span className="bg-pink text-on-pink rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-extrabold">
          Bento cake decorating
        </span>
        <span className="text-latte text-[11px] font-bold">Sat 2:00pm</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <svg viewBox="0 0 44 44" className="size-11 -rotate-90">
          <circle cx="22" cy="22" r="18" fill="none" stroke="var(--color-blush)" strokeWidth="5" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="var(--color-rose)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="113"
            strokeDashoffset="22.6"
          />
        </svg>
        <div>
          <p className="text-cocoa text-sm font-extrabold">8 / 10 seats</p>
          <p className="text-latte text-xs">Nearly full 🔥</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The desktop-only left half: brand, mood, and one honest glimpse of the
 * product rather than generic marketing art. Hidden below `lg` — on a phone
 * this space belongs entirely to the form.
 */
export function BrandPanel() {
  return (
    <div className="from-blush via-buttercream to-pink/50 relative hidden overflow-hidden bg-gradient-to-br lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      {/* Ambient blobs — decorative texture, drifting slowly. Reduced motion
          zeroes the animation globally, leaving the shapes static. */}
      <div
        aria-hidden="true"
        className="bg-terra-soft animate-drift absolute -top-24 -left-16 size-72 rounded-full opacity-60 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="bg-sage-soft animate-drift absolute top-1/3 -right-20 size-80 rounded-full opacity-50 blur-3xl"
        style={{ animationDelay: '4s' }}
      />
      <div
        aria-hidden="true"
        className="bg-butter-soft animate-drift absolute -bottom-24 left-1/4 size-64 rounded-full opacity-50 blur-3xl"
        style={{ animationDelay: '8s' }}
      />

      <div className="relative">
        <span className="font-display text-2xl">Maison Abeer</span>
      </div>

      <div className="relative flex flex-1 flex-col justify-center gap-8">
        <div>
          <p className="font-display max-w-[15ch] text-[clamp(32px,3vw,44px)] leading-[1.1]">
            {/* The sparkle stays with its word: on its own line it read as a stray glyph. */}
            Your studio <span className="whitespace-nowrap">bestie ✨</span>
          </p>
          <p className="text-cocoa/80 mt-4 max-w-[38ch] text-[15px]">
            <HandNote className="text-[19px]">
              Bookings, prep lists, name tags and guest chat — all in one calm place that still
              feels like your brand.
            </HandNote>
          </p>
        </div>

        <ShowcaseCard />
      </div>

      <p className="text-latte relative text-[13px] font-bold">
        &copy; {new Date().getFullYear()} Maison Abeer — your studio bestie
      </p>
    </div>
  );
}
