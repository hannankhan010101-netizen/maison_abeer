'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';

import { useIsOnScreen } from '@/lib/public/useIsOnScreen';

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

// Small, pushed to the outer edges and well back in z — this is meant to
// read as a faint halo around the headline, not compete with it. A first
// pass here scaled these to roughly fill the hero and sat them near the
// centre; on a short, wide viewport (a laptop, not a phone) that put the
// shapes directly behind — and visually on top of — the studio name and the
// Instagram line, exactly what BookingHero's mask below now also guards
// against structurally rather than trusting position tuning alone.
function shapesFor(primaryColor?: string, accentColor?: string) {
  return [
    { geometry: 'icosahedron', color: primaryColor ?? DEFAULT_ROSE, position: [-2.3, 0.8, -1.4], scale: 0.46, speed: 0.6 },
    { geometry: 'torus', color: accentColor ?? DEFAULT_PINK, position: [2.2, -0.7, -1.6], scale: 0.4, speed: 0.45 },
    { geometry: 'octahedron', color: '#C96F4A', position: [-1.9, -1.0, -2.0], scale: 0.28, speed: 0.8 },
    { geometry: 'sphere', color: '#ADBE93', position: [2.0, 1.1, -1.8], scale: 0.24, speed: 0.5 },
    { geometry: 'dodecahedron', color: '#F7DC94', position: [2.6, -0.1, -2.4], scale: 0.22, speed: 0.7 },
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
        roughness={0.5}
        metalness={0.05}
        emissive={shape.color}
        emissiveIntensity={0.08}
        transparent
        opacity={0.85}
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
