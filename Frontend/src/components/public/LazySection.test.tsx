import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LazySection } from './LazySection';

/**
 * A below-the-fold section that costs nothing until it is nearly in view.
 * It holds its place so the page never jumps, loads once, and if the chunk
 * cannot be fetched it leaves the placeholder and says nothing.
 */

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;

let observers: Array<{
  cb: Callback;
  options?: IntersectionObserverInit;
  disconnect: ReturnType<typeof vi.fn>;
}> = [];

beforeEach(() => {
  observers = [];
  class FakeObserver {
    disconnect = vi.fn();
    constructor(cb: Callback, options?: IntersectionObserverInit) {
      observers.push({ cb, options, disconnect: this.disconnect });
    }
    observe() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Hello({ name }: { name: string }) {
  return <p>Hello {name}</p>;
}

function enter() {
  act(() => {
    for (const observer of observers) observer.cb([{ isIntersecting: true }]);
  });
}

describe('LazySection', () => {
  it('holds its place and does not load before it is near the viewport', () => {
    const load = vi.fn(() => Promise.resolve({ default: Hello }));

    const { container } = render(
      <LazySection load={load} props={{ name: 'Sana' }} minHeight="480px" label="Craft corner" />,
    );

    const placeholder = container.querySelector('[data-lazy-section]') as HTMLElement;
    expect(placeholder).toBeTruthy();
    expect(placeholder.style.minHeight).toBe('480px');
    expect(placeholder.getAttribute('aria-hidden')).toBe('true');
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByText(/Hello/)).not.toBeInTheDocument();
  });

  it('asks the observer to look well before the section is on screen', () => {
    render(
      <LazySection
        load={() => Promise.resolve({ default: Hello })}
        props={{ name: 'x' }}
        minHeight="1px"
        label="x"
      />,
    );
    expect(observers[0]?.options?.rootMargin).toBe('600px 0px');
  });

  it('keeps the section out of the paint cost until it is shown', () => {
    const { container } = render(
      <LazySection
        load={() => Promise.resolve({ default: Hello })}
        props={{ name: 'x' }}
        minHeight="300px"
        label="x"
      />,
    );
    const placeholder = container.querySelector('[data-lazy-section]') as HTMLElement;
    expect(placeholder.style.contentVisibility).toBe('auto');
    expect(placeholder.style.getPropertyValue('contain-intrinsic-size')).toContain('300px');
  });

  it('loads once on intersection and renders the component with its props', async () => {
    const load = vi.fn(() => Promise.resolve({ default: Hello }));

    render(
      <LazySection load={load} props={{ name: 'Sana' }} minHeight="480px" label="Craft corner" />,
    );
    enter();
    enter();

    expect(await screen.findByText('Hello Sana')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('stops observing once it has started loading', async () => {
    render(
      <LazySection
        load={() => Promise.resolve({ default: Hello })}
        props={{ name: 'x' }}
        minHeight="1px"
        label="x"
      />,
    );
    enter();
    await screen.findByText('Hello x');
    expect(observers[0]?.disconnect).toHaveBeenCalled();
  });

  it('leaves the placeholder and does not throw when the chunk fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn(() => Promise.reject(new Error('chunk 404')));

    const { container } = render(
      <LazySection load={load} props={{ name: 'x' }} minHeight="200px" label="Craft corner" />,
    );
    enter();

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(container.querySelector('[data-lazy-section]')).toBeTruthy();
    expect(screen.queryByText(/Hello/)).not.toBeInTheDocument();
  });

  it('loads at once when the browser has no IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const load = vi.fn(() => Promise.resolve({ default: Hello }));

    render(<LazySection load={load} props={{ name: 'Fallback' }} minHeight="1px" label="x" />);

    expect(await screen.findByText('Hello Fallback')).toBeInTheDocument();
  });

  it('names the section for the people who inspect the page, not for readers', () => {
    const { container } = render(
      <LazySection
        load={() => Promise.resolve({ default: Hello })}
        props={{ name: 'x' }}
        minHeight="1px"
        label="Craft corner"
      />,
    );
    expect(container.querySelector('[data-lazy-section="Craft corner"]')).toBeTruthy();
  });
});
