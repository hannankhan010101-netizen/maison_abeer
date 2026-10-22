import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tier, saveStory } = vi.hoisted(() => ({
  tier: { value: 0 },
  saveStory: vi.fn(async (_model: unknown) => 'downloaded' as const),
}));
vi.mock('@/lib/motion', () => ({ useMotionTier: () => tier.value, haptic: vi.fn() }));
vi.mock('@/lib/public/storyCanvas', () => ({ saveStory }));

import { answersFor, QUIZ, RESULT_COPY, scoreQuiz } from '@/lib/public/quiz';

import WhichWorkshop from './WhichWorkshop';

const ALL = ['cake', 'pottery', 'painting'] as const;

function answer(index: number) {
  fireEvent.click(screen.getByRole('button', { name: QUIZ[index]!.answers[1]!.label }));
}

describe('WhichWorkshop', () => {
  beforeEach(() => {
    tier.value = 0;
    saveStory.mockClear();
  });

  it('renders nothing for fewer than two crafts', () => {
    const one = render(<WhichWorkshop crafts={['pottery']} onBook={vi.fn()} />);
    expect(one.container).toBeEmptyDOMElement();
    one.unmount();
    const twice = render(<WhichWorkshop crafts={['cake', 'cake']} onBook={vi.fn()} />);
    expect(twice.container).toBeEmptyDOMElement();
  });

  it('shows the first question with progress', () => {
    render(<WhichWorkshop crafts={[...ALL]} onBook={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Which workshop are you?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: QUIZ[0]!.text })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', String(QUIZ.length));
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('completes to a result among the crafts and books it', () => {
    const onBook = vi.fn();
    const crafts = ['pottery', 'painting'] as const;
    render(<WhichWorkshop crafts={[...crafts]} onBook={onBook} />);
    // The second answer the guest is actually shown on each question.
    const shown = QUIZ.map((question) => answersFor(question, crafts)[1]!);
    shown.forEach((choice) => fireEvent.click(screen.getByRole('button', { name: choice.label })));
    const picked = shown.map((choice) => choice.id);
    const { kind } = scoreQuiz(picked, ['pottery', 'painting']);
    expect(['pottery', 'painting']).toContain(kind);
    expect(screen.getByRole('heading', { name: RESULT_COPY[kind].vibe })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Book this one' }));
    expect(onBook).toHaveBeenCalledWith(kind);
  });

  it('Back keeps the answers already given', () => {
    render(<WhichWorkshop crafts={[...ALL]} onBook={vi.fn()} />);
    answer(0);
    answer(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: QUIZ[1]!.text })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: QUIZ[1]!.answers[1]!.label })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: QUIZ[0]!.answers[1]!.label })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('works by keyboard alone, end to end, and shares the Story', async () => {
    const user = userEvent.setup();
    render(<WhichWorkshop crafts={[...ALL]} onBook={vi.fn()} handle="maisonabeer" />);
    for (let index = 0; index < QUIZ.length; index += 1) {
      // Focus moves to each new question; Tab reaches its first answer.
      await user.tab();
      expect(document.activeElement).toHaveTextContent(QUIZ[index]!.answers[0]!.label);
      await user.keyboard('{Enter}');
    }
    const result = screen.getByRole('heading', { name: /./, level: 3 });
    expect(document.activeElement).toBe(result);
    await user.tab();
    expect(document.activeElement).toHaveAccessibleName('Book this one');
    await user.tab();
    expect(document.activeElement).toHaveAccessibleName('Share to Story');
    await act(async () => {
      await user.keyboard('{Enter}');
    });
    expect(saveStory).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'cake', handle: '@maisonabeer' }),
    );
    expect(await screen.findByText('Saved to your photos or downloads')).toBeInTheDocument();
  });

  it('starts again from the first question', () => {
    render(<WhichWorkshop crafts={[...ALL]} onBook={vi.fn()} />);
    QUIZ.forEach((_, index) => answer(index));
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(screen.getByRole('heading', { name: QUIZ[0]!.text })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: QUIZ[0]!.answers[1]!.label })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('is static under reduced motion and animates its steps otherwise', () => {
    const still = render(<WhichWorkshop crafts={[...ALL]} onBook={vi.fn()} />);
    expect(still.container.querySelector('.quiz')).not.toHaveClass('is-animated');
    still.unmount();
    tier.value = 1;
    const moving = render(<WhichWorkshop crafts={[...ALL]} onBook={vi.fn()} />);
    expect(moving.container.querySelector('.quiz')).toHaveClass('is-animated');
  });

  it('does not offer an answer that only points at a craft the studio does not teach', () => {
    render(<WhichWorkshop crafts={['cake', 'pottery']} onBook={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'Music on, colours everywhere' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Something sweet cooling on the counter' }),
    ).toBeInTheDocument();
  });

  it('recovers when the picture cannot be made, instead of staying busy', async () => {
    saveStory.mockRejectedValueOnce(new Error('canvas gone'));
    render(<WhichWorkshop crafts={[...ALL]} onBook={vi.fn()} />);
    QUIZ.forEach((_, index) => answer(index));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share to Story' }));
    });

    expect(await screen.findByText(/would not save/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Share to Story/ })).toBeEnabled();
  });
});
