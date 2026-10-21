/**
 * What the craft is, as a strip of stickers. Headed "The idea" on purpose:
 * the guide describes the craft in general and never promises what any one
 * class produces.
 */
export function MakesStrip({ makes }: { makes: readonly string[] }) {
  return (
    <div className="corner-block">
      <h4 className="corner-block-title">The idea</h4>
      <ul className="corner-makes">
        {makes.map((item) => (
          <li key={item} className="corner-sticker">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
