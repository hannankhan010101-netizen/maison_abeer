'use client';

import { useEffect, useId, useRef, useState, type JSX, type Ref } from 'react';

import { Reveal } from '@/components/motion/Reveal';
import { loadGsap, type GsapKit } from '@/lib/motion/gsap';
import { useMayAnimate } from '@/lib/public/useMayAnimate';
import '@/styles/units/making.css';

import {
  MAKING_STAGES,
  MAKING_VIEWBOX,
  RIM_OPENED,
  RIM_PULLED,
  stageForProgress,
} from './makingStages';

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
const RIMS = { lump: undefined, centred: undefined, opened: 'opened', pulled: 'pulled' } as const;

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

/** A four-pointed sparkle, drawn as pinched curves around its centre. */
function sparkle(x: number, y: number, r: number): string {
  return `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z`;
}

const SPARKLES = [sparkle(28, 62, 8), sparkle(176, 96, 6), sparkle(158, 36, 4)];

interface SceneProps {
  path: string;
  /** Which opening to draw, if any: bowls and vases are hollow, a lump is not. */
  rim?: 'opened' | 'pulled';
  lines?: boolean;
  /** On the pinned stage the rim and lines start hidden and fade in with the scroll. */
  hidden?: boolean;
  bodyRef?: Ref<SVGPathElement>;
  rimRef?: Ref<SVGPathElement>;
  linesRef?: Ref<SVGGElement>;
}

/**
 * One picture: a potter's wheel, the shadow of the piece on it, the clay with
 * a lit side and a shaded side, the dark opening where there is one, and a few
 * flecks of slip.
 *
 * Only the body and the rim are paths that morph; the wheel, shadow and flecks
 * stay put. The shading is a gradient across the body's own bounding box, so it
 * follows the shape wherever the morph has got to with nothing extra to animate.
 */
function Scene({ path, rim, lines, hidden, bodyRef, rimRef, linesRef }: SceneProps): JSX.Element {
  const gradient = useId();
  const hide = hidden ? { opacity: 0 } : undefined;

  return (
    <svg viewBox={MAKING_VIEWBOX} className="making__svg" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" className="making__stop-lit" />
          <stop offset="0.45" className="making__stop-mid" />
          <stop offset="1" className="making__stop-shade" />
        </linearGradient>
      </defs>

      <g data-making-wheel>
        <path
          d="M18 214 L18 221 C18 235 182 235 182 221 L182 214 Z"
          className="making__wheel-side"
        />
        <ellipse cx="100" cy="214" rx="82" ry="13" className="making__wheel-top" />
        <path d="M44 214 C64 221 136 221 156 214" className="making__wheel-lines" />
        <path d="M62 218 C80 223 120 223 138 218" className="making__wheel-lines" />
      </g>
      <ellipse data-making-shadow cx="100" cy="213" rx="60" ry="8" className="making__shadow" />

      <path
        d={path}
        data-making-body
        ref={bodyRef}
        className="making__shape"
        style={{ fill: `url(#${gradient})` }}
      />

      {rim ? (
        <path
          d={rim === 'opened' ? RIM_OPENED : RIM_PULLED}
          data-making-rim
          ref={rimRef}
          className="making__rim"
          style={hide}
        />
      ) : null}

      {lines ? (
        <g data-making-lines ref={linesRef} className="making__throwing-lines" style={hide}>
          <path d="M52 146 C80 154 120 154 148 146" />
          <path d="M50 164 C80 173 120 173 150 164" />
          <path d="M54 182 C82 190 118 190 146 182" />
        </g>
      ) : null}

      <g className="making__flecks">
        {SPARKLES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

export function MakingOf(): JSX.Element {
  const mayAnimate = useMayAnimate();
  const wide = useIsWide();
  const [kit, setKit] = useState<Kit | null>(null);
  const [stage, setStage] = useState(0);

  const sectionRef = useRef<HTMLElement>(null);
  const stagePathRef = useRef<SVGPathElement>(null);
  const stageRimRef = useRef<SVGPathElement>(null);
  const stageLinesRef = useRef<SVGGElement>(null);

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
      const rim = stageRimRef.current;
      const lines = stageLinesRef.current;
      if (!path || !rim || !lines) return;

      // The body morphs the whole way; the opening appears as the bowl is
      // opened and narrows with the neck; the throwing lines come last.
      const timeline = gsap.timeline({ defaults: { ease: 'none' } });
      MAKING_STAGES.slice(1).forEach((next, index) => {
        timeline.to(path, { morphSVG: next.path, duration: 1 }, index);
      });
      timeline.to(rim, { opacity: 1, duration: 1 }, 1);
      timeline.to(rim, { morphSVG: RIM_PULLED, duration: 1 }, 2);
      timeline.to(lines, { opacity: 1, duration: 1 }, 2);

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
        gsap.set([path, rim, lines], { clearProps: 'all' });
        setStage(0);
      };
    }

    if (mode === 'stages') {
      const frames = Array.from(
        section.querySelectorAll<SVGPathElement>('figure [data-making-body]'),
      );
      const tweens: { kill: () => void }[] = [];
      // The opening and the lines belong to the later frames and arrive after
      // the body has changed shape, not before.
      const extras = (path: SVGPathElement) =>
        Array.from(
          path.closest('figure')?.querySelectorAll('[data-making-rim], [data-making-lines]') ?? [],
        );
      frames.forEach((path) => gsap.set(extras(path), { opacity: 0 }));

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
                    gsap.to(extras(entry.target as SVGPathElement), {
                      opacity: 1,
                      duration: 0.4,
                      delay: 0.7,
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
          gsap.set([path, ...extras(path)], { clearProps: 'all' });
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
          <Scene
            path={FIRST.path}
            rim="opened"
            lines
            hidden
            bodyRef={stagePathRef}
            rimRef={stageRimRef}
            linesRef={stageLinesRef}
          />
          <p className="making__stage-caption">{MAKING_STAGES[stage]!.caption}</p>
        </div>
      ) : null}

      <ol className="making__strip">
        {MAKING_STAGES.map((item) => (
          <li key={item.id}>
            <figure className="making__frame">
              <Scene path={item.path} rim={RIMS[item.id]} lines={item.id === 'pulled'} />
              <figcaption className="making__caption">{item.caption}</figcaption>
            </figure>
          </li>
        ))}
      </ol>
    </section>
  );
}
