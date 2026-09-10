'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';

/**
 * The hero's floating craft shapes — a piped-frosting blob, a clay coil, a
 * ring. Not generic tech-startup spheres: three, in the studio's own
 * palette, chosen to read as "cake, pottery, ceramics" at a glance rather
 * than "3D was available."
 *
 * Every guardrail here exists because this page's actual job is a fast,
 * frictionless booking form for someone with no patience, on a phone, from
 * an ad — the same audience 3D is least forgiving to. See the surrounding
 * comments for what each one buys:
 *
 * - Capped device pixel ratio (`dpr`): a retina phone would otherwise
 *   render 3-4x the pixels for zero visible gain.
 * - Paused off-screen (`frameloop`): scrolled past, it costs nothing —
 *   no GPU work, no battery.
 * - Never mounted at all under `prefers-reduced-motion` or when WebGL is
 *   unavailable: `BookingHero` (the caller) handles both, and this
 *   component assumes it is safe to animate continuously.
 * - Lazy-loaded via `next/dynamic` with `ssr: false` where it's used —
 *   `three` + `@react-three/fiber` never ship to a visitor who never
 *   scrolls into view, and never block the booking form underneath it.
 */

const DEFAULT_ROSE = '#E2849E';
const DEFAULT_PINK = '#F2AABE';

function shapesFor(primaryColor?: string, accentColor?: string) {
  return [
    { geometry: 'icosahedron', color: primaryColor ?? DEFAULT_ROSE, position: [-1.3, 0.4, 0], scale: 0.85, speed: 0.6 },
    { geometry: 'torus', color: accentColor ?? DEFAULT_PINK, position: [1.2, -0.3, -0.4], scale: 0.7, speed: 0.45 },
    { geometry: 'octahedron', color: '#C96F4A', position: [0.3, 0.9, -0.8], scale: 0.5, speed: 0.8 },
    { geometry: 'sphere', color: '#ADBE93', position: [-0.6, -0.8, -0.3], scale: 0.42, speed: 0.5 },
    { geometry: 'dodecahedron', color: '#F7DC94', position: [1.6, 0.7, -1.1], scale: 0.4, speed: 0.7 },
  ] as const;
}

type Shape = ReturnType<typeof shapesFor>[number];

function FloatingShape({ shape, index }: { shape: Shape; index: number }) {
  const ref = useRef<Mesh>(null);
  const start = index * 1.7; // phase-offsets the bob so shapes don't move in lockstep

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;

    const t = state.clock.elapsedTime;
    mesh.rotation.x = t * shape.speed * 0.3;
    mesh.rotation.y = t * shape.speed * 0.4;
    mesh.position.y = shape.position[1] + Math.sin(t * 0.6 + start) * 0.18;
  });

  return (
    <mesh ref={ref} position={shape.position as unknown as [number, number, number]} scale={shape.scale}>
      {shape.geometry === 'icosahedron' ? <icosahedronGeometry args={[1, 0]} /> : null}
      {shape.geometry === 'torus' ? <torusGeometry args={[0.7, 0.28, 16, 48]} /> : null}
      {shape.geometry === 'octahedron' ? <octahedronGeometry args={[1, 0]} /> : null}
      {shape.geometry === 'sphere' ? <sphereGeometry args={[1, 24, 24]} /> : null}
      {shape.geometry === 'dodecahedron' ? <dodecahedronGeometry args={[1, 0]} /> : null}
      <meshStandardMaterial
        color={shape.color}
        roughness={0.35}
        metalness={0.05}
        emissive={shape.color}
        emissiveIntensity={0.12}
      />
    </mesh>
  );
}

function Rig({ shapes }: { shapes: readonly Shape[] }) {
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    // A faint, slow drift toward the pointer — not a full parallax rig, just
    // enough that the scene reads as alive rather than a looping GIF. Tiny
    // on purpose: this sits behind a headline, not in front of it.
    const targetX = (state.pointer.x * Math.PI) / 40;
    const targetY = (state.pointer.y * Math.PI) / 60;
    group.current.rotation.y += (targetX - group.current.rotation.y) * 0.02;
    group.current.rotation.x += (-targetY - group.current.rotation.x) * 0.02;
  });

  return (
    <group ref={group}>
      {shapes.map((shape, index) => (
        <FloatingShape key={shape.geometry} shape={shape} index={index} />
      ))}
    </group>
  );
}

/** Pauses the render loop entirely while the canvas is scrolled off-screen. */
function useIsOnScreen<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)), {
      rootMargin: '200px',
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, onScreen];
}

export interface Hero3DProps {
  /** The studio's own Brand Kit colours, when set — see BookingHero. */
  primaryColor?: string;
  accentColor?: string;
}

export default function Hero3D({ primaryColor, accentColor }: Hero3DProps) {
  const [containerRef, onScreen] = useIsOnScreen<HTMLDivElement>();
  const shapes = shapesFor(primaryColor, accentColor);

  return (
    <div ref={containerRef} className="absolute inset-0" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={onScreen ? 'always' : 'never'}
        camera={{ position: [0, 0, 4.2], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 3, 4]} intensity={0.6} />
        <Rig shapes={shapes} />
      </Canvas>
    </div>
  );
}

export const HERO_3D_SHAPE_COUNT = shapesFor().length;
