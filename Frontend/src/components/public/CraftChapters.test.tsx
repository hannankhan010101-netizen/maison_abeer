import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/motion/gsap', () => ({ loadGsap: vi.fn(() => Promise.resolve(null)) }));

import type { PublicClass } from '@/lib/public/api';
import { allocatePhotos } from '@/lib/public/photoBudget';
import type { CraftKind } from '@/lib/public/studioPhotos';

import { CraftChapters } from './CraftChapters';

function aClass(token: string, name: string): PublicClass {
  return {
    id: `${token}-1`,
    name,
    starts_at: '2030-01-01T10:00:00Z',
    ends_at: '2030-01-01T12:00:00Z',
    location: null,
    color_token: token,
    photo_url: null,
    seats_left: 4,
    is_full: false,
    waitlist_is_open: false,
  };
}

const THREE = [
  aClass('terra', 'Pottery'),
  aClass('pink', 'Bento cakes'),
  aClass('sage', 'Ceramic painting'),
];
const THREE_CRAFTS: CraftKind[] = ['pottery', 'cake', 'painting'];

function sources(root: ParentNode) {
  return [...root.querySelectorAll('img')].map((img) => img.getAttribute('src'));
}

describe('CraftChapters', () => {
  it('one craft needs no menu: the chapter stands under its own eyebrow', () => {
    render(<CraftChapters classes={[aClass('terra', 'Pottery & wheel throwing')]} />);

    expect(
      screen.queryByRole('heading', { name: 'Pick your kind of mess' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pottery & wheel throwing' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Pottery & wheel throwing' })).toHaveTextContent(
      'clay under your fingertips',
    );
  });

  it('several crafts keep the menu, centred, naming the section', () => {
    render(<CraftChapters classes={THREE} />);

    const heading = screen.getByRole('heading', { name: 'Pick your kind of mess' });
    expect(screen.getByRole('region', { name: 'Pick your kind of mess' })).toBeInTheDocument();
    expect(heading.closest('header')).toHaveClass('text-center');
  });

  it.each([
    ['three crafts', THREE, THREE_CRAFTS],
    // Two crafts: the fan has taken a third photo of cake, so its chapter
    // must not reach for that one again.
    [
      'two crafts',
      [aClass('pink', 'Bento cakes'), aClass('terra', 'Pottery')],
      ['cake', 'pottery'] as CraftKind[],
    ],
  ] as const)('takes each chapter’s photographs from the budget (%s)', (_name, classes, crafts) => {
    render(<CraftChapters classes={[...classes]} />);

    const budget = allocatePhotos(crafts);
    for (const item of classes) {
      const article = screen.getByRole('article', { name: item.name });
      const kind = article.getAttribute('data-craft-chapter') as CraftKind;
      const chapter = budget.chapters[kind]!;
      expect(sources(article)).toEqual([chapter.large.small, chapter.accent.small]);
    }
  });

  it('left-aligns every chapter’s words, whichever side the photo is on', () => {
    const { container } = render(<CraftChapters classes={THREE} />);

    const blocks = container.querySelectorAll('.chapter-text');
    expect(blocks).toHaveLength(3);
    for (const block of blocks) {
      expect(block).toHaveClass('text-left', 'md:text-left', 'items-start');
      expect(block).not.toHaveClass('text-center');
      expect(block.className).not.toMatch(/md:text-right/);
    }
  });
});

describe('CraftChapters — one chapter per craft', () => {
  it('folds two class types of the same craft into one chapter, so no photo repeats', () => {
    // pink and butter both read as cake (craftOf); two chapters would show the
    // same large and accent photographs twice, breaking the photo budget.
    render(
      <CraftChapters classes={[aClass('pink', 'Bento cakes'), aClass('butter', 'Cupcakes')]} />,
    );

    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(
      screen.queryByRole('heading', { name: 'Pick your kind of mess' }),
    ).not.toBeInTheDocument();
  });
});
