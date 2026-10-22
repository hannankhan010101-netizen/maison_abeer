import { useEffect, useState } from 'react';

import type { CraftKind } from '@/lib/public/studioPhotos';

/**
 * The cast's fun facts, from the craft guide.
 *
 * The guide is the whole Craft Corner's copy, far more than the hero needs, so
 * it is fetched as its own chunk right after mount instead of riding in the
 * first screen's script. Until it lands each list is empty: a tap still
 * squishes and says "wow", it just has nothing to say yet.
 */

const NONE: Record<CraftKind, string[]> = { pottery: [], cake: [], painting: [] };

export function useCraftFacts(): Record<CraftKind, string[]> {
  const [facts, setFacts] = useState(NONE);

  useEffect(() => {
    let alive = true;
    import('@/lib/public/craftGuide')
      .then(({ guideFor }) => {
        if (!alive) return;
        setFacts({
          pottery: guideFor('pottery').funFacts,
          cake: guideFor('cake').funFacts,
          painting: guideFor('painting').funFacts,
        });
      })
      .catch(() => {
        // No facts is a complete cast; nothing to report to a guest.
      });
    return () => {
      alive = false;
    };
  }, []);

  return facts;
}
