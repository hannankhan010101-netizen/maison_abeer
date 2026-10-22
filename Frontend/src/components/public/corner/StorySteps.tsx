'use client';

import type { CSSProperties } from 'react';

import type { GuideStep } from '@/lib/public/craftGuide';
import { useMotionTier } from '@/lib/motion';

/**
 * How the craft goes, as a short vertical story.
 *
 * Tier 0 is a plain ordered list, complete and still. Tier 1 asks the
 * stylesheet for a gentle staggered reveal; tier 2 asks for steps that rise
 * as they scroll through the viewport (CSS scroll-driven, where supported).
 * Either way the motion lives in `corner.css` under `no-preference`.
 */
export function StorySteps({ steps }: { steps: readonly GuideStep[] }) {
  const tier = useMotionTier();
  const motion = tier === 2 ? 'is-scroll' : tier === 1 ? 'is-reveal' : '';

  return (
    <div className="corner-block">
      <h4 className="corner-block-title">How it goes</h4>
      <ol className={`corner-steps ${motion}`.trim()} data-motion={tier === 0 ? 'none' : motion}>
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="corner-step"
            style={{ '--step-index': index } as CSSProperties}
          >
            <span className="corner-step-number" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <p className="corner-step-title">{step.title}</p>
              <p className="corner-step-text">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
