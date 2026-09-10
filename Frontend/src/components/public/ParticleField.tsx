'use client';

import { useEffect, useRef } from 'react';

import { prefersReducedMotion } from '@/lib/public/motion';

/**
 * Ambient dust drifting through the hero — the studio-air feeling of light
 * catching clay dust or flour hanging in a sunlit workroom. Plain Canvas 2D,
 * not another WebGL scene: two or three dozen soft dots redrawn every frame
 * don't need a GPU pipeline, and this keeps the hero's one heavy dependency
 * (`three`, already paid for by `Hero3D`) from growing a second one just
 * for atmosphere.
 *
 * Never mounted under `prefers-reduced-motion`, Data Saver, or a slow
 * connection — the same three signals every other decorative layer on this
 * page already checks — and the particle count is cut roughly in half below
 * the tablet breakpoint, where both the screen and the battery are smaller.
 */

interface Particle {
  x: number;
  y: number;
  r: number;
  driftX: number;
  driftY: number;
  opacity: number;
  phase: number;
}

function makeParticles(count: number, width: number, height: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: 0.6 + Math.random() * 1.6,
    driftX: (Math.random() - 0.5) * 0.06,
    driftY: -0.04 - Math.random() * 0.08,
    opacity: 0.15 + Math.random() * 0.35,
    phase: Math.random() * Math.PI * 2,
  }));
}

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (prefersReducedMotion()) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = canvas.parentElement;
    if (!container) return;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let pointerX = -9999;
    let pointerY = -9999;
    let onScreen = true;
    let frame: number;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = width < 640 ? 16 : 30;
      particles = makeParticles(count, width, height);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        onScreen = Boolean(entry?.isIntersecting);
      },
      { rootMargin: '100px' },
    );
    intersectionObserver.observe(container);

    let elapsed = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!onScreen) return;

      elapsed += 1;
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        // A faint, gentle pull toward the cursor — never enough to make the
        // motes feel controlled, just enough that the field notices you.
        const dx = pointerX - p.x;
        const dy = pointerY - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 160 && dist > 0.01) {
          p.x += (dx / dist) * 0.05;
          p.y += (dy / dist) * 0.05;
        }

        p.x += p.driftX + Math.sin(elapsed * 0.004 + p.phase) * 0.03;
        p.y += p.driftY;

        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(251, 243, 231, ${p.opacity})`;
        ctx.fill();
      }
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 mix-blend-screen"
    />
  );
}
