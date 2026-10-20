'use client';

import { useEffect, useRef, useState, type JSX } from 'react';

import { Reveal } from '@/components/motion/Reveal';
import { loadGsap, type GsapKit } from '@/lib/motion/gsap';
import { useMayAnimate } from '@/lib/public/useMayAnimate';
import '@/styles/units/making.css';

import { MAKING_STAGES, MAKING_VIEWBOX, stageForProgress } from './makingStages';

/**
 * "The making of" — how a lump of clay becomes a vase, told by scrolling.
 *
 * The page is complete without any script: four captioned frames, one per
 * stage, are always in the DOM, so a screen reader, a guest with reduced motion
 * and a failed library load all get the whole story as a plain strip. Motion is
 * an enhancement laid over it, and only once the library has actually arrived:
 *
 * - from 768px up the section pins and ONE silhouette morphs through the stages
 *   as the guest scrolls, the caption changing with it;
 * - below that nothing is pinned (a pinned section on a phone fights the
 *   address bar and the thumb), and each frame morphs from the previous shape
 *   once it is 60% in view.
 *
 * The copy describes the craft in general. It deliberately says nothing about
 * this studio's classes: how long they run, what they cost, what a guest takes
 * home, whether pieces are fired.
 */

type Kit = GsapKit<'ScrollTrigger' | 'MorphSVGPlugin'>;
type Mode = 'static' | 'stages' | 'pinned';

const WIDE_QUERY = '(min-width: 768px)';
const FIRST = MAKING_STAGES[0];

/** Whether the viewport is wide enough to pin; false where it cannot be asked. */
function useIsWide(): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return wide;
}

export function MakingOf(): JSX.Element {
  const mayAnimate = useMayAnimate();
  const wide = useIsWide();
  const [kit, setKit] = useState<Kit | null>(null);
  const [stage, setStage] = useState(0);

  const sectionRef = useRef<HTMLElement>(null);
  const stagePathRef = useRef<SVGPathElement>(null);

  // Fetch the library only for a guest who may be animated, and drop it again
  // the moment they turn reduced motion on, which stops everything below.
  useEffect(() => {
    if (!mayAnimate) {
      setKit(null);
      return;
    }
    let cancelled = false;
    void loadGsap('ScrollTrigger', 'MorphSVGPlugin').then((loaded) => {
      if (!cancelled) setKit(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [mayAnimate]);

  const mode: Mode = !kit ? 'static' : wide ? 'pinned' : 'stages';

  useEffect(() => {
    if (!kit) return;
    const section = sectionRef.current;
    if (!section) return;
    const { gsap, ScrollTrigger } = kit;

    if (mode === 'pinned') {
      const path = stagePathRef.current;
      if (!path) return;

      const timeline = gsap.timeline({ defaults: { ease: 'none' } });
      MAKING_STAGES.slice(1).forEach((next) => {
        timeline.to(path, { morphSVG: next.path, duration: 1 });
      });

      let current = 0;
      const trigger = ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: '+=250%',
        pin: true,
        scrub: 0.6,
        animation: timeline,
        onUpdate: (self) => {
          const next = stageForProgress(self.progress);
          if (next !== current) {
            current = next;
            setStage(next);
          }
        },
      });

      return () => {
        // Reverting removes the pin spacer and puts the section back in flow.
        trigger.kill(true);
        timeline.kill();
        gsap.set(path, { clearProps: 'all' });
        setStage(0);
      };
    }

    if (mode === 'stages') {
      const frames = Array.from(section.querySelectorAll<SVGPathElement>('[data-making-shape]'));
      const tweens: { kill: () => void }[] = [];

      // Every frame past the first begins as the shape before it, so entering
      // view is the moment the clay changes, not a jump.
      frames.forEach((path, index) => {
        if (index > 0) path.setAttribute('d', MAKING_STAGES[index - 1]!.path);
      });

      const observer =
        typeof IntersectionObserver === 'function'
          ? new IntersectionObserver(
              (entries) => {
                for (const entry of entries) {
                  if (!entry.isIntersecting) continue;
                  const index = frames.indexOf(entry.target as SVGPathElement);
                  observer?.unobserve(entry.target);
                  tweens.push(
                    gsap.to(entry.target, {
                      morphSVG: MAKING_STAGES[index]!.path,
                      duration: 0.9,
                      ease: 'power2.out',
                    }),
                  );
                }
              },
              { threshold: 0.6 },
            )
          : null;

      if (observer) {
        frames.forEach((path, index) => {
          if (index > 0) observer.observe(path);
        });
      } else {
        // No way to watch for visibility: show every stage as drawn.
        frames.forEach((path, index) => path.setAttribute('d', MAKING_STAGES[index]!.path));
      }

      return () => {
        observer?.disconnect();
        tweens.forEach((tween) => tween.kill());
        frames.forEach((path, index) => {
          path.setAttribute('d', MAKING_STAGES[index]!.path);
          gsap.set(path, { clearProps: 'all' });
        });
      };
    }
  }, [kit, mode]);

  const pinned = mode === 'pinned';

  return (
    <section
      ref={sectionRef}
      aria-labelledby="making-heading"
      data-pinned={pinned ? '' : undefined}
      className="making"
    >
      <Reveal className="making__intro">
        <p className="font-hand text-rose-ink text-xl">from lump to vessel</p>
        <h2
          id="making-heading"
          className="font-display mt-1 text-[clamp(26px,5vw,38px)] leading-[1.08]"
        >
          Clay is shaped a little at a time
        </h2>
      </Reveal>

      {pinned ? (
        <div className="making__stage" aria-hidden="true">
          <svg viewBox={MAKING_VIEWBOX} className="making__svg" focusable="false">
            <path ref={stagePathRef} d={FIRST.path} className="making__shape" />
          </svg>
          <p className="making__stage-caption">{MAKING_STAGES[stage]!.caption}</p>
        </div>
      ) : null}

      <ol className="making__strip">
        {MAKING_STAGES.map((item) => (
          <li key={item.id}>
            <figure className="making__frame">
              <svg
                viewBox={MAKING_VIEWBOX}
                className="making__svg"
                aria-hidden="true"
                focusable="false"
              >
                <path d={item.path} data-making-shape className="making__shape" />
              </svg>
              <figcaption className="making__caption">{item.caption}</figcaption>
            </figure>
          </li>
        ))}
      </ol>
    </section>
  );
}
