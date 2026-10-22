import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QUIZ } from '@/lib/public/quiz';

import { QuizStep } from './QuizStep';

const question = QUIZ[2]!;

describe('QuizStep', () => {
  it('shows the question and one button per answer, the chosen one pressed', () => {
    render(<QuizStep question={question} chosen={question.answers[2]!.id} onPick={vi.fn()} />);
    expect(screen.getByRole('heading', { name: question.text })).toHaveAttribute('tabindex', '-1');
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(
      question.answers.map((answer) => answer.label),
    );
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
    ]);
  });

  it('reports the picked answer id', () => {
    const onPick = vi.fn();
    render(<QuizStep question={question} chosen={undefined} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: question.answers[0]!.label }));
    expect(onPick).toHaveBeenCalledWith(question.answers[0]!.id);
  });
});
