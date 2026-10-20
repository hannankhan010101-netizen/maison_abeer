/**
 * A handwritten ribbon under the hero — the studio's crafts and its promises
 * walking slowly across the page, the way a shop writes its specials along
 * the window.
 *
 * The crafts are the real ones on offer, so the ribbon never advertises a
 * class the studio does not run. The phrases are the four things the page
 * already promises elsewhere (the confirmation says aprons are on us and to
 * just bring yourself); nothing here is a new claim.
 *
 * Two copies of the track, the second `aria-hidden`: a screen reader hears
 * the list once, and the loop (`marquee` in globals.css moves one copy's
 * width) has no visible seam. Under reduced motion it stops, and the first
 * copy is simply a short row of words.
 */

export const RIBBON_PHRASES = [
  'Made by hand',
  'Small groups',
  'Aprons on us',
  'Just bring yourself',
] as const;

/** Crafts and phrases interleaved, each once — a craft named like a phrase does not repeat. */
export function ribbonItems(crafts: readonly string[]): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  const longest = Math.max(crafts.length, RIBBON_PHRASES.length);

  for (let index = 0; index < longest; index += 1) {
    for (const candidate of [crafts[index], RIBBON_PHRASES[index]]) {
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        items.push(candidate);
      }
    }
  }

  return items;
}

export function StudioRibbon({ crafts }: { crafts: readonly string[] }) {
  const items = ribbonItems(crafts);

  return (
    <div className="border-line bg-paper relative overflow-hidden border-y-[1.5px] py-2.5">
      <div className="animate-marquee flex w-max motion-reduce:animate-none">
        <Track items={items} />
        <Track items={items} hidden />
      </div>
    </div>
  );
}

function Track({ items, hidden }: { items: string[]; hidden?: boolean }) {
  return (
    <ul
      aria-hidden={hidden || undefined}
      aria-label={hidden ? undefined : 'About the studio'}
      className="flex shrink-0 items-center"
    >
      {items.map((item) => (
        <li
          key={item}
          className="font-hand text-rose-ink flex items-center text-[20px] leading-none whitespace-nowrap"
        >
          <span className="px-5">{item}</span>
          <span aria-hidden="true" className="text-butter-ink text-sm">
            ✿
          </span>
        </li>
      ))}
    </ul>
  );
}
