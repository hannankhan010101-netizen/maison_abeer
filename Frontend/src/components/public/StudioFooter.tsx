/**
 * The storefront's sign-off.
 *
 * The page used to simply stop under the booking card. A guest who scrolled
 * past the form without booking — most of them, on a first visit — fell off
 * the end with nowhere to go. This gives them the one real channel the
 * studio has: its Instagram, as a link rather than the text it was in the
 * hero. No invented address, hours or phone number; the payload has none,
 * and a footer that guesses is worse than a short one.
 */
export function StudioFooter({
  studioName,
  handle,
}: {
  studioName: string;
  handle?: string | null;
}) {
  return (
    <footer className="border-line mt-6 border-t-[1.5px] border-dashed px-4 py-10 text-center sm:px-6">
      <p className="font-display text-2xl tracking-tight">
        {studioName}
        <span className="text-rose-ink">.</span>
      </p>
      <p className="font-hand text-rose-ink mt-1 text-xl">see you at the studio ♡</p>

      {handle ? (
        <p className="text-latte mt-3 text-sm">
          Questions? Send us a message on{' '}
          <a
            href={`https://instagram.com/${handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cocoa decoration-pink hover:decoration-rose inline-flex min-h-[44px] items-center font-extrabold underline decoration-2 underline-offset-4"
          >
            @{handle}
          </a>
        </p>
      ) : null}
    </footer>
  );
}
