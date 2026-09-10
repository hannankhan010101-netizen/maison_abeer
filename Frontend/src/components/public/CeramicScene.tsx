'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { LatheGeometry, SplineCurve, Vector2, type Mesh } from 'three';

import { useIsOnScreen } from '@/lib/public/useIsOnScreen';

/**
 * A single hand-thrown vase, floating and turning slowly — the page's one
 * moment of "look at the actual craft" rather than another photo of it.
 *
 * There is no 3D asset anywhere in this app (see Hero3D's own note on the
 * same constraint for photography) — no model file, no import pipeline for
 * one. The form here is built procedurally instead: a lathed profile
 * (rotate a 2D silhouette around an axis, exactly how a wheel-thrown pot is
 * actually made) with small per-vertex noise added afterward so the wall
 * has the faint waver of a hand on a spinning wheel rather than the
 * mathematically perfect surface a lathe alone produces. That noise is the
 * entire difference between "ceramic" and "game asset" here.
 */

const CLAY_COLOR = '#D9C9B4';

/** The vase's silhouette, one side only — `LatheGeometry` sweeps it 360°
 * around the Y axis. Asymmetric on purpose: a perfectly even taper reads as
 * a CAD model, not a pot. */
function useVaseGeometry() {
  return useMemo(() => {
    const controlPoints = [
      [0.02, -1.0],
      [0.42, -0.97],
      [0.58, -0.78],
      [0.52, -0.5],
      [0.4, -0.22],
      [0.46, 0.05],
      [0.6, 0.32],
      [0.5, 0.58],
      [0.34, 0.72],
      [0.38, 0.82],
      [0.3, 0.9],
    ].map(([x, y]) => new Vector2(x, y));

    // `LatheGeometry` interpolates *straight lines* between whatever points
    // it's given — feeding it these eleven control points directly produced
    // a visibly faceted, beveled silhouette (each gap between them became a
    // flat conical panel), which read as a low-poly asset rather than a
    // thrown pot. Running them through a spline first and sampling *that*
    // is what actually curves the wall smoothly between them.
    const profile = new SplineCurve(controlPoints).getPoints(72);

    const geometry = new LatheGeometry(profile, 56);

    // The hand-thrown waver: a small, angle- and height-dependent offset on
    // every vertex's radius. Two overlaid sine frequencies (a slow wide
    // wobble plus a faster fine one) read as an irregular wall rather than
    // a regular ripple, which a single frequency would.
    const position = geometry.attributes.position!;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const angle = Math.atan2(z, x);
      const radius = Math.sqrt(x * x + z * z);
      const wobble = Math.sin(angle * 5 + y * 2.5) * 0.012 + Math.sin(angle * 11 - y * 4) * 0.006;
      const nextRadius = radius + wobble;
      position.setX(i, Math.cos(angle) * nextRadius);
      position.setZ(i, Math.sin(angle) * nextRadius);
    }
    geometry.computeVertexNormals();

    return geometry;
  }, []);
}

/** A soft, blurred ellipse standing in for a contact shadow — cheaper than
 * a real shadow map, and this page runs `powerPreference: 'low-power'`. */
function GroundShadow() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.05, 0]}>
      <circleGeometry args={[1.1, 32]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.16} />
    </mesh>
  );
}

function Vase({ scrollVelocityRef }: { scrollVelocityRef: React.RefObject<number> }) {
  const mesh = useRef<Mesh>(null);
  const geometry = useVaseGeometry();
  const { pointer } = useThree();

  const targetRotation = useRef(0);
  const currentRotation = useRef(0);

  useFrame((state) => {
    const node = mesh.current;
    if (!node) return;

    const t = state.clock.elapsedTime;

    // A slow continuous turn, as if resting on a wheel that never fully
    // stops — plus a small lean toward wherever the cursor currently is,
    // and a nudge from recent scroll speed so the piece feels handled
    // rather than looping. All three are gentle; none should be legible as
    // "reacting to input" on its own, only as one object that's alive.
    targetRotation.current += 0.0026 + scrollVelocityRef.current * 0.00018;
    currentRotation.current += (targetRotation.current - currentRotation.current) * 0.04;
    node.rotation.y = currentRotation.current + pointer.x * 0.35;
    node.rotation.x = pointer.y * -0.08;

    // The breathing scale — barely perceptible, the difference between a
    // still object and one that reads as physically present.
    const breathe = 1 + Math.sin(t * 0.5) * 0.012;
    node.scale.setScalar(breathe);
    node.position.y = Math.sin(t * 0.4) * 0.05;
  });

  return (
    <mesh ref={mesh} geometry={geometry} castShadow={false}>
      <meshStandardMaterial color={CLAY_COLOR} roughness={0.88} metalness={0.02} />
    </mesh>
  );
}

export default function CeramicScene() {
  const [containerRef, onScreen] = useIsOnScreen<HTMLDivElement>();
  const scrollVelocity = useRef(0);

  return (
    <div ref={containerRef} className="absolute inset-0" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={onScreen ? 'always' : 'never'}
        camera={{ position: [0, 0.1, 3.4], fov: 38 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          // A gentle warm tone rather than the renderer's flat default —
          // this is the one place on the page light actually "falls" on
          // something, so it is worth a beat of care.
          gl.setClearColor(0x000000, 0);
        }}
      >
        <ambientLight intensity={1.0} />
        <directionalLight position={[2.4, 3, 3]} intensity={0.8} color="#FFF3E2" />
        <directionalLight position={[-2.6, -1, -2]} intensity={0.25} color="#C9A98C" />
        <Vase scrollVelocityRef={scrollVelocity} />
        <GroundShadow />
        <ScrollVelocityTracker outRef={scrollVelocity} />
      </Canvas>
    </div>
  );
}

/**
 * Feeds recent scroll speed to the vase without a second render loop or a
 * scroll listener living outside React's tree — decays toward zero every
 * frame so a burst of scrolling reads as a nudge, not a spin that never
 * settles.
 */
function ScrollVelocityTracker({ outRef }: { outRef: React.RefObject<number> }) {
  const lastY = useRef<number | null>(null);

  useFrame(() => {
    if (typeof window === 'undefined') return;
    const y = window.scrollY;
    if (lastY.current === null) {
      lastY.current = y;
      return;
    }
    const delta = y - lastY.current;
    lastY.current = y;
    outRef.current = outRef.current * 0.9 + delta * 0.1;
  });

  return null;
}
