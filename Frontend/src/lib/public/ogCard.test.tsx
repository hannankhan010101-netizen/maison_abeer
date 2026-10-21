import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OgCard, titleCaseSlug } from './ogCard';

const html = (props: Parameters<typeof OgCard>[0]) => renderToStaticMarkup(<OgCard {...props} />);

describe('OgCard', () => {
  it('sets the name at 96px, stepping down to 72px past 24 characters', () => {
    expect(html({ name: 'Maison Abeer', crafts: [], seats: null })).toContain('font-size:96px');
    const long = 'The Very Long Studio Name Co';
    expect(long.length).toBeGreaterThan(24);
    const markup = html({ name: long, crafts: [], seats: null });
    expect(markup).toContain('font-size:72px');
    expect(markup).not.toContain('font-size:96px');
  });

  it('draws one sticker per craft, and none for no crafts', () => {
    expect(html({ name: 'A', crafts: [], seats: null })).not.toContain('data-sticker');
    const markup = html({ name: 'A', crafts: ['pottery', 'cake', 'painting'], seats: null });
    expect(markup.match(/data-sticker=/g)).toHaveLength(3);
    expect(markup).toContain('#c96f4a');
    expect(markup).toContain('#f2aabe');
    expect(markup).toContain('#adbe93');
  });

  it('shows the seats line only when there is one', () => {
    expect(html({ name: 'A', crafts: [], seats: null })).not.toContain('data-seats');
    const markup = html({ name: 'A', crafts: ['cake'], seats: '8 seats left in the next class' });
    expect(markup).toContain('8 seats left in the next class');
    expect(markup).toContain('font-size:36px');
  });

  it('uses literal colours only — no CSS variables, no classes', () => {
    const markup = html({
      name: 'Maison Abeer',
      crafts: ['pottery', 'cake', 'painting'],
      seats: 'last seat in the next class',
    });
    expect(markup).not.toContain('var(');
    expect(markup).not.toContain('class=');
    expect(markup).toContain('#fff8f0');
    expect(markup).toContain('radial-gradient');
  });
});

describe('titleCaseSlug', () => {
  it('turns a slug into a name', () => {
    expect(titleCaseSlug('maison-abeer')).toBe('Maison Abeer');
    expect(titleCaseSlug('clay_and-cake')).toBe('Clay And Cake');
  });
});
