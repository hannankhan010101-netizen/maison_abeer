import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadGsap, mayAnimate } = vi.hoisted(() => ({
  loadGsap: vi.fn(),
  mayAnimate: vi.fn(() => true),
}));

vi.mock('@/lib/motion/gsap', () => ({ loadGsap }));
vi.mock('@/lib/public/useMayAnimate', () => ({ useMayAnimate: mayAnimate }));

import { DragToss } from './DragToss';

/**
 * A polaroid a guest can flick. It is decoration on top of a card that is
 * already there, so the card must survive the library not arriving, and must
 * hand the element back when it leaves.
 */

function fakeKit() {
  const kill = vi.fn();
  const create = vi.fn((..._args: unknown[]) => [{ kill }]);
  const set = vi.fn();
  return { kit: { gsap: { set }, Draggable: { create }, InertiaPlugin: {} }, kill, create, set };
}

function bounds() {
  return { current: document.createElement('div') };
}

function card() {
  return screen.getByText('Card').parentElement!;
}

beforeEach(() => {
  loadGsap.mockReset();
  mayAnimate.mockReset();
  mayAnimate.mockReturnValue(true);
});

describe('DragToss', () => {
  it('renders its child unchanged when gsap does not load', async () => {
    loadGsap.mockResolvedValue(null);
    render(
      <DragToss boundsRef={bounds()}>
        <p>Card</p>
      </DragToss>,
    );

    await waitFor(() => expect(loadGsap).toHaveBeenCalledWith('Draggable', 'InertiaPlugin'));
    expect(screen.getByText('Card')).toBeInTheDocument();
  });

  it('lets a vertical swipe scroll the page: pan-y, and native touch scrolling kept', async () => {
    const { kit, create } = fakeKit();
    loadGsap.mockResolvedValue(kit);
    const boundsRef = bounds();
    render(
      <DragToss boundsRef={boundsRef}>
        <p>Card</p>
      </DragToss>,
    );

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(card().style.touchAction).toBe('pan-y');

    const [target, options] = create.mock.calls[0] as [Element, Record<string, unknown>];
    expect(target).toBe(card());
    expect(options).toMatchObject({
      type: 'x,y',
      inertia: true,
      bounds: boundsRef.current,
      edgeResistance: 0.85,
      allowNativeTouchScrolling: true,
      dragClickables: false,
    });
  });

  it('takes touch-action back from Draggable, which sets none on the card and its children', async () => {
    const { kit, create } = fakeKit();
    create.mockImplementation((...args: unknown[]) => {
      // What the real library does when it drags on both axes.
      const node = args[0] as HTMLElement;
      for (const target of [node, ...node.querySelectorAll<HTMLElement>('*')]) {
        target.style.touchAction = 'none';
      }
      return [{ kill: vi.fn() }];
    });
    loadGsap.mockResolvedValue(kit);
    render(
      <DragToss boundsRef={bounds()}>
        <p>Card</p>
      </DragToss>,
    );

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(card().style.touchAction).toBe('pan-y');
    expect(screen.getByText('Card').style.touchAction).toBe('pan-y');
  });

  it('brings the card to the front when it is pressed', async () => {
    const { kit, create, set } = fakeKit();
    loadGsap.mockResolvedValue(kit);
    render(
      <DragToss boundsRef={bounds()}>
        <p>Card</p>
      </DragToss>,
    );
    await waitFor(() => expect(create).toHaveBeenCalled());

    const options = (create.mock.calls[0] as unknown as [Element, { onPress: () => void }])[1];
    options.onPress();
    expect(set).toHaveBeenCalledWith(card(), { zIndex: expect.any(Number) });
  });

  it('kills the draggable on unmount', async () => {
    const { kit, kill, create } = fakeKit();
    loadGsap.mockResolvedValue(kit);
    const { unmount } = render(
      <DragToss boundsRef={bounds()}>
        <p>Card</p>
      </DragToss>,
    );
    await waitFor(() => expect(create).toHaveBeenCalled());

    unmount();
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it('does not create one if it unmounted before gsap arrived', async () => {
    const { kit, create } = fakeKit();
    let arrive: (value: unknown) => void = () => {};
    loadGsap.mockReturnValue(new Promise((resolve) => (arrive = resolve)));
    const { unmount } = render(
      <DragToss boundsRef={bounds()}>
        <p>Card</p>
      </DragToss>,
    );

    unmount();
    arrive(kit);
    await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
  });

  it('never asks for gsap when motion is not allowed', () => {
    mayAnimate.mockReturnValue(false);
    render(
      <DragToss boundsRef={bounds()}>
        <p>Card</p>
      </DragToss>,
    );

    expect(loadGsap).not.toHaveBeenCalled();
    expect(screen.getByText('Card')).toBeInTheDocument();
  });
});
