import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Tilt } from './Tilt';

/**
 * Tilt leans a card toward the pointer. It needs a mouse to lean toward, and
 * it is exactly the kind of motion a guest can ask not to have.
 */

function media(overrides: Record<string, boolean>) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: overrides[query] ?? false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function frame() {
  return act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

/** A pointer event with real coordinates (jsdom has no PointerEvent). */
function point(node: Element, type: string, clientX: number, clientY: number) {
  node.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }));
}

function mount(props: { maxDeg?: number } = {}) {
  render(
    <Tilt {...props}>
      <p>Card</p>
    </Tilt>,
  );
  // The element the pointer events land on is the one carrying the variables.
  const host = screen.getByText('Card').closest('[data-tilt]') as HTMLElement;
  host.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0 }) as DOMRect;
  return host;
}

afterEach(() => vi.unstubAllGlobals());

describe('Tilt', () => {
  it('leans toward the pointer, by at most maxDeg, and levels out when it leaves', async () => {
    media({ '(pointer: fine)': true });
    const host = mount({ maxDeg: 8 });

    point(host, 'pointermove', 100, 0); // top-right corner
    await frame();
    expect(host.style.getPropertyValue('--ry')).toBe('8.00deg');
    expect(host.style.getPropertyValue('--rx')).toBe('8.00deg');

    point(host, 'pointermove', 5000, -5000); // far outside: still clamped
    await frame();
    expect(host.style.getPropertyValue('--ry')).toBe('8.00deg');
    expect(host.style.getPropertyValue('--rx')).toBe('8.00deg');

    point(host, 'pointerleave', 0, 0);
    expect(host.style.getPropertyValue('--rx')).toBe('0deg');
    expect(host.style.getPropertyValue('--ry')).toBe('0deg');
  });

  it('puts the glare under the pointer', async () => {
    media({ '(pointer: fine)': true });
    const host = mount();

    point(host, 'pointermove', 25, 75);
    await frame();

    expect(host.style.getPropertyValue('--gx')).toBe('25%');
    expect(host.style.getPropertyValue('--gy')).toBe('75%');
  });

  it('does nothing when motion is unwelcome', async () => {
    media({ '(pointer: fine)': true, '(prefers-reduced-motion: reduce)': true });
    const host = mount();

    point(host, 'pointermove', 100, 0);
    await frame();

    expect(host.style.getPropertyValue('--ry')).toBe('');
  });

  it('does nothing on a touch screen, where there is no pointer to follow', async () => {
    media({ '(pointer: fine)': false });
    const host = mount();

    point(host, 'pointermove', 100, 0);
    await frame();

    expect(host.style.getPropertyValue('--ry')).toBe('');
  });

  it('leaves its children in place and reachable', () => {
    media({ '(pointer: fine)': true });
    mount();

    expect(screen.getByText('Card')).toBeInTheDocument();
  });
});
