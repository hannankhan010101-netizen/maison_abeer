import { HandNote } from '@/components/ui/Card';

import { ShowcaseTicket } from './ShowcaseTicket';

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

        {/* An illustration, labelled as one: see ShowcaseTicket. */}
        <div className="pl-4">
          <ShowcaseTicket />
        </div>
      </div>

      <p className="text-latte relative text-[13px] font-bold">
        &copy; {new Date().getFullYear()} Maison Abeer — your studio bestie
      </p>
    </div>
  );
}
