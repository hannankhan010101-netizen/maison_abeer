import { render } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';

import { MOODS, type CharacterProps } from './cast';

/**
 * What every member of the cast promises, shared by each character's test: a
 * face for each mood, a fixed box, hidden from assistive tech (the button
 * around it carries the name), and nothing fetched: no image, no font, no
 * outside reference.
 */
export function describeCharacter(name: string, Character: ComponentType<CharacterProps>) {
  describe(name, () => {
    it.each(MOODS)('draws a face for the %s mood', (mood) => {
      const { container } = render(<Character mood={mood} />);
      const svg = container.querySelector('svg')!;
      expect(svg).not.toBeNull();
      expect(svg.getAttribute('data-mood')).toBe(mood);
      expect(svg.querySelector('[data-part="eyes"]')).not.toBeNull();
      expect(svg.querySelector('[data-part="mouth"]')).not.toBeNull();
    });

    it('draws each mood differently', () => {
      const faces = MOODS.map((mood) => {
        const { container } = render(<Character mood={mood} />);
        return container.querySelector('[data-part="face"]')!.innerHTML;
      });
      expect(new Set(faces).size).toBe(MOODS.length);
    });

    it('is happy by default', () => {
      const { container } = render(<Character />);
      expect(container.querySelector('svg')!.getAttribute('data-mood')).toBe('happy');
    });

    it('has a fixed viewBox and a fixed pixel size', () => {
      const { container } = render(<Character size={72} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('viewBox')).toBe('0 0 64 64');
      expect(svg.getAttribute('width')).toBe('72');
      expect(svg.getAttribute('height')).toBe('72');
      const defaults = render(<Character />).container.querySelector('svg')!;
      expect(defaults.getAttribute('width')).toMatch(/^\d+$/);
      expect(defaults.getAttribute('height')).toBe(defaults.getAttribute('width'));
    });

    it('is hidden from assistive tech and not focusable', () => {
      const { container } = render(<Character />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
    });

    it('fetches nothing: no image, no text, no font, no outside reference', () => {
      const { container } = render(<Character mood="wow" />);
      const markup = container.innerHTML;
      expect(container.querySelector('image, text, foreignObject, use')).toBeNull();
      expect(markup).not.toMatch(/href=|url\(|font-family|https?:/);
    });
  });
}
