import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Reveal } from './Reveal';

afterEach(() => vi.unstubAllGlobals());

describe('Reveal', () => {
  it('shows its content straight away when motion is unwelcome', async () => {
    // jsdom has no matchMedia, which the app treats as "do less".
    render(
      <Reveal>
        <p>Hello</p>
      </Reveal>,
    );

    const wrapper = screen.getByText('Hello').parentElement!;
    await waitFor(() => expect(wrapper.style.opacity).toBe('1'));
    expect(wrapper.style.transform).toBe('none');
  });

  it('shows its content where IntersectionObserver is missing, rather than hiding it for ever', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    vi.stubGlobal('IntersectionObserver', undefined);

    render(
      <Reveal>
        <p>Hello</p>
      </Reveal>,
    );

    await waitFor(() => expect(screen.getByText('Hello').parentElement!.style.opacity).toBe('1'));
  });

  it('renders as the element asked for and keeps its class', () => {
    render(
      <Reveal as="section" className="mine" delayMs={120} distance={40}>
        <p>Hello</p>
      </Reveal>,
    );

    const wrapper = screen.getByText('Hello').parentElement!;
    expect(wrapper.tagName).toBe('SECTION');
    expect(wrapper).toHaveClass('mine');
    expect(wrapper.style.transitionDelay).toBe('120ms');
  });
});
