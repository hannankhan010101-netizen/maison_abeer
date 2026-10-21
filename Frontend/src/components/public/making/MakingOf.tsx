'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type JSX, type Ref } from 'react';

import { Reveal } from '@/components/motion/Reveal';
import { loadGsap, type GsapKit } from '@/lib/motion/gsap';
import { useMayAnimate } from '@/lib/public/useMayAnimate';
import '@/styles/units/making.css';

import {
  MAKING_STAGES,
  MAKING_VIEWBOX,
  PIN_DISTANCE,
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
  hands: Stage['hands'];
  /** Which opening to draw, if any: bowls and vases are hollow, a lump is not. */
  rim?: 'opened' | 'pulled';
  lines?: boolean;
  /** On the pinned stage the rim and lines start hidden and fade in with the scroll. */
  hidden?: boolean;
  /** The throwing lines have arrived and may draw themselves on. */
  drawn?: boolean;
  bodyRef?: Ref<SVGPathElement>;
  rimRef?: Ref<SVGPathElement>;
  linesRef?: Ref<SVGGElement>;
  handsRef?: Ref<SVGGElement>;
  leftRef?: Ref<SVGPathElement>;
  rightRef?: Ref<SVGPathElement>;
}

type Stage = (typeof MAKING_STAGES)[number];

/** A `useId` value made safe to sit inside `url(#…)` and `href="#…"`. */
function useSvgId(): string {
  return useId().replace(/[^\w-]/g, '');
}

/**
 * One picture: a potter's wheel with a shadow round its head, the shadow of
 * the piece on it, the clay lit from the upper left with a grain to it, the
 * dark opening where there is one, the throwing lines, two hands at work and
 * a few flecks of slip.
 *
 * Only the body, the rim and the two hands are paths that morph; everything
 * else stays put. The shading is a gradient across the body's own bounding
 * box, so it follows the shape with nothing extra to animate. The grain is a
 * filter on a still rectangle — rasterised once — shown through a clip that
 * borrows the body's outline by reference: the filter never sits on a path
 * that changes, so a morph frame costs a clip, not a fresh noise texture.
 */
function Scene({
  path,
  hands,
  rim,
  lines,
  hidden,
  drawn,
  bodyRef,
  rimRef,
  linesRef,
  handsRef,
  leftRef,
  rightRef,
}: SceneProps): JSX.Element {
  const id = useSvgId();
  const ids = {
    body: `clay-body-${id}`,
    grain: `clay-grain-${id}`,
    clip: `clay-clip-${id}`,
    shape: `clay-shape-${id}`,
  };
  const hide = hidden ? { opacity: 0 } : undefined;

  return (
    <svg viewBox={MAKING_VIEWBOX} className="making__svg" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={ids.body} cx="0.4" cy="0.34" r="0.78" fx="0.3" fy="0.24">
          <stop offset="0" className="making__stop-highlight" />
          <stop offset="0.22" className="making__stop-lit" />
          <stop offset="0.6" className="making__stop-mid" />
          <stop offset="1" className="making__stop-shade" />
        </radialGradient>
        <filter id={ids.grain} x="0" y="0" width="1" height="1">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            seed="7"
            stitchTiles="stitch"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.8 1.2"
            result="specks"
          />
          <feFlood className="making__grain-ink" />
          <feComposite in2="specks" operator="in" />
        </filter>
        <clipPath id={ids.clip}>
          <use href={`#${ids.shape}`} />
        </clipPath>
      </defs>

      <g data-making-wheel>
        <path
          d="M18 214 L18 221 C18 235 182 235 182 221 L182 214 Z"
          className="making__wheel-side"
        />
        <ellipse cx="100" cy="214" rx="82" ry="13" className="making__wheel-top" />
        <path d="M26 218 C56 229 144 229 174 218" className="making__wheel-rim" />
        <path d="M44 214 C64 221 136 221 156 214" className="making__wheel-lines" />
      </g>
      <ellipse data-making-shadow cx="100" cy="213" rx="60" ry="8" className="making__shadow" />

      <path
        id={ids.shape}
        d={path}
        data-making-body
        ref={bodyRef}
        className="making__shape"
        fill={`url(#${ids.body})`}
      />
      <g clipPath={`url(#${ids.clip})`}>
        <rect
          x="0"
          y="0"
          width="200"
          height="240"
          filter={`url(#${ids.grain})`}
          className="making__grain"
        />
      </g>

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
        <g
          data-making-lines
          data-drawn={drawn ? '' : undefined}
          ref={linesRef}
          className="making__throwing-lines"
          style={hide}
        >
          <path pathLength={1} className="making-line" d="M52 146 C80 154 120 154 148 146" />
          <path pathLength={1} className="making-line" d="M50 164 C80 173 120 173 150 164" />
          <path pathLength={1} className="making-line" d="M54 182 C82 190 118 190 146 182" />
        </g>
      ) : null}

      <g data-making-hands ref={handsRef} opacity={hands.opacity} className="making__hands">
        <path data-making-hand="left" ref={leftRef} d={hands.left} />
        <path data-making-hand="right" ref={rightRef} d={hands.right} />
      </g>

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
  const stageHandsRef = useRef<SVGGElement>(null);
  const stageLeftRef = useRef<SVGPathElement>(null);
  const stageRightRef = useRef<SVGPathElement>(null);

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
      const hands = stageHandsRef.current;
      const left = stageLeftRef.current;
      const right = stageRightRef.current;
      if (!path || !rim || !lines || !hands || !left || !right) return;

      // The body morphs the whole way; the hands approach as it is centred,
      // cup it, draw it up and lift away at the end; the opening appears as
      // the bowl is opened and narrows with the neck; the lines come last.
      const timeline = gsap.timeline({ defaults: { ease: 'none' } });
      MAKING_STAGES.slice(1).forEach((next, index) => {
        timeline.to(path, { morphSVG: next.path, duration: 1 }, index);
        timeline.to(left, { morphSVG: next.hands.left, duration: 1 }, index);
        timeline.to(right, { morphSVG: next.hands.right, duration: 1 }, index);
      });
      timeline.to(hands, { opacity: 1, duration: 1 }, 0);
      timeline.to(hands, { y: -14, duration: 0.4 }, 2.6);
      timeline.to(rim, { opacity: 1, duration: 1 }, 1);
      timeline.to(rim, { morphSVG: RIM_PULLED, duration: 1 }, 2);
      timeline.to(lines, { opacity: 1, duration: 1 }, 2);

      let current = 0;
      const trigger = ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: PIN_DISTANCE,
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
        gsap.set([path, rim, lines, hands, left, right], { clearProps: 'all' });
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
      const handsOf = (path: SVGPathElement) => {
        const figure = path.closest('figure');
        return {
          group: figure?.querySelector<SVGGElement>('[data-making-hands]') ?? null,
          left: figure?.querySelector<SVGPathElement>('[data-making-hand="left"]') ?? null,
          right: figure?.querySelector<SVGPathElement>('[data-making-hand="right"]') ?? null,
        };
      };
      /** Put a frame's clay and hands where a given stage has them. */
      const drawAs = (path: SVGPathElement, stage: Stage) => {
        path.setAttribute('d', stage.path);
        const { group, left, right } = handsOf(path);
        left?.setAttribute('d', stage.hands.left);
        right?.setAttribute('d', stage.hands.right);
        group?.setAttribute('opacity', String(stage.hands.opacity));
      };
      frames.forEach((path) => gsap.set(extras(path), { opacity: 0 }));

      // Every frame past the first begins as the shape before it, hands and
      // all, so entering view is the moment the clay changes, not a jump.
      frames.forEach((path, index) => {
        if (index > 0) drawAs(path, MAKING_STAGES[index - 1]!);
      });

      const observer =
        typeof IntersectionObserver === 'function'
          ? new IntersectionObserver(
              (entries) => {
                for (const entry of entries) {
                  if (!entry.isIntersecting) continue;
                  const target = entry.target as SVGPathElement;
                  const index = frames.indexOf(target);
                  const stage = MAKING_STAGES[index]!;
                  const { group, left, right } = handsOf(target);
                  observer?.unobserve(target);
                  const morph = { duration: 0.9, ease: 'power2.out' };
                  tweens.push(
                    gsap.to(target, { morphSVG: stage.path, ...morph }),
                    gsap.to(left, { morphSVG: stage.hands.left, ...morph }),
                    gsap.to(right, { morphSVG: stage.hands.right, ...morph }),
                    gsap.to(group, { attr: { opacity: stage.hands.opacity }, ...morph }),
                    gsap.to(extras(target), {
                      opacity: 1,
                      duration: 0.4,
                      delay: 0.7,
                      onStart: () =>
                        target
                          .closest('figure')
                          ?.querySelector('[data-making-lines]')
                          ?.setAttribute('data-drawn', ''),
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
        frames.forEach((path, index) => drawAs(path, MAKING_STAGES[index]!));
        section
          .querySelectorAll('[data-making-lines]')
          .forEach((lines) => lines.setAttribute('data-drawn', ''));
      }

      return () => {
        observer?.disconnect();
        tweens.forEach((tween) => tween.kill());
        frames.forEach((path, index) => {
          drawAs(path, MAKING_STAGES[index]!);
          gsap.set([path, ...extras(path)], { clearProps: 'all' });
        });
        section
          .querySelectorAll('[data-making-lines]')
          .forEach((lines) => lines.removeAttribute('data-drawn'));
      };
    }
  }, [kit, mode]);

  const pinned = mode === 'pinned';

  return (
    <section
      ref={sectionRef}
      aria-labelledby="making-heading"
      data-pinned={pinned ? '' : undefined}
      data-mode={mode}
      className="making"
    >
      <div className="making-layout">
        <div className="making__words">
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
            <ol
              className="making-beats"
              aria-hidden="true"
              style={{ '--beat': stage } as CSSProperties}
            >
              {MAKING_STAGES.map((item, index) => (
                <li key={item.id} aria-current={index === stage ? 'step' : undefined}>
                  {item.caption}
                </li>
              ))}
            </ol>
          ) : null}
        </div>

        <div className="making__scene">
          {pinned ? (
            <div className="making__stage" aria-hidden="true">
              <Scene
                path={FIRST.path}
                hands={FIRST.hands}
                rim="opened"
                lines
                hidden
                drawn={stage === 3}
                bodyRef={stagePathRef}
                rimRef={stageRimRef}
                linesRef={stageLinesRef}
                handsRef={stageHandsRef}
                leftRef={stageLeftRef}
                rightRef={stageRightRef}
              />
            </div>
          ) : null}

          <ol className="making__strip">
            {MAKING_STAGES.map((item) => (
              <li key={item.id}>
                <figure className="making__frame">
                  <Scene
                    path={item.path}
                    hands={item.hands}
                    rim={RIMS[item.id]}
                    lines={item.id === 'pulled'}
                  />
                  <figcaption className="making__caption">{item.caption}</figcaption>
                </figure>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
