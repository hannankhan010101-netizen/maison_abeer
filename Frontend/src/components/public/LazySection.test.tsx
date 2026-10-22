import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
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
    // A real observer that has been disconnected never calls back.
    for (const observer of observers) {
      if (observer.disconnect.mock.calls.length === 0) observer.cb([{ isIntersecting: true }]);
    }
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
    expect(placeholder.style.getPropertyValue('--lazy-h')).toBe('480px');
    expect(placeholder.className).toContain('lazy-section');
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

  it('can hold a different height on a wide screen', () => {
    const { container } = render(
      <LazySection
        load={() => Promise.resolve({ default: Hello })}
        props={{ name: 'x' }}
        minHeight="720px"
        minHeightLg="1800px"
        label="Making of"
      />,
    );
    const placeholder = container.querySelector('[data-lazy-section]') as HTMLElement;
    expect(placeholder.style.getPropertyValue('--lazy-h')).toBe('720px');
    expect(placeholder.style.getPropertyValue('--lazy-h-lg')).toBe('1800px');
  });

  it('uses the same height on a wide screen when none is given', () => {
    const { container } = render(
      <LazySection
        load={() => Promise.resolve({ default: Hello })}
        props={{ name: 'x' }}
        minHeight="300px"
        label="x"
      />,
    );
    const placeholder = container.querySelector('[data-lazy-section]') as HTMLElement;
    expect(placeholder.style.getPropertyValue('--lazy-h-lg')).toBe('300px');
  });
});

describe('LazySection prefetch', () => {
  let idleCallbacks: Array<() => void> = [];

  beforeEach(() => {
    idleCallbacks = [];
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      idleCallbacks.push(cb);
      return idleCallbacks.length;
    });
    vi.stubGlobal('cancelIdleCallback', () => {});
  });

  function idle() {
    act(() => {
      for (const cb of idleCallbacks.splice(0)) cb();
    });
  }

  it('fetches the code in idle time, without rendering the section', async () => {
    const load = vi.fn(() => Promise.resolve({ default: Hello }));

    render(<LazySection load={load} props={{ name: 'Sana' }} minHeight="300px" label="x" />);
    expect(load).not.toHaveBeenCalled();

    idle();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    // Warm, but not mounted: it only mounts when it is near the viewport.
    expect(screen.queryByText(/Hello/)).not.toBeInTheDocument();
  });

  it('uses the warmed code when the section arrives and never loads twice', async () => {
    const load = vi.fn(() => Promise.resolve({ default: Hello }));

    render(<LazySection load={load} props={{ name: 'Sana' }} minHeight="300px" label="x" />);
    idle();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    enter();

    expect(await screen.findByText('Hello Sana')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not prefetch for a visitor who asked to save data', () => {
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    const load = vi.fn(() => Promise.resolve({ default: Hello }));

    render(<LazySection load={load} props={{ name: 'x' }} minHeight="300px" label="x" />);
    idle();

    expect(load).not.toHaveBeenCalled();
  });

  it('can be switched off', () => {
    const load = vi.fn(() => Promise.resolve({ default: Hello }));

    render(
      <LazySection
        load={load}
        props={{ name: 'x' }}
        minHeight="300px"
        label="x"
        prefetch={false}
      />,
    );
    idle();

    expect(load).not.toHaveBeenCalled();
  });

  it('retries on arrival when the idle fetch failed', async () => {
    const load = vi
      .fn<() => Promise<{ default: typeof Hello }>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ default: Hello });

    render(<LazySection load={load} props={{ name: 'Sana' }} minHeight="300px" label="x" />);
    idle();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    enter();

    expect(await screen.findByText('Hello Sana')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('LazySection under React StrictMode', () => {
  it('still mounts without an IntersectionObserver, although effects run twice', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const load = vi.fn(() => Promise.resolve({ default: Hello }));

    render(
      <StrictMode>
        <LazySection load={load} props={{ name: 'Strict' }} minHeight="1px" label="x" />
      </StrictMode>,
    );

    expect(await screen.findByText('Hello Strict')).toBeInTheDocument();
  });

  it('still mounts on arrival, although effects run twice', async () => {
    const load = vi.fn(() => Promise.resolve({ default: Hello }));

    render(
      <StrictMode>
        <LazySection load={load} props={{ name: 'Strict' }} minHeight="1px" label="x" />
      </StrictMode>,
    );
    enter();

    expect(await screen.findByText('Hello Strict')).toBeInTheDocument();
  });
});
