import type { Ref } from 'react';

import type { QuizAnswer, QuizQuestion } from '@/lib/public/quiz';

/**
 * One question: its text as a heading (focus lands here when the step
 * changes), then its answers as large buttons. The answer already chosen is
 * pressed, so Back shows what the guest picked.
 */
export function QuizStep({
  question,
  answers = question.answers,
  chosen,
  onPick,
  headingRef,
}: {
  question: QuizQuestion;
  /** The answers to show (a studio that teaches two crafts may not need all three). Defaults to every answer. */
  answers?: QuizAnswer[];
  chosen: string | undefined;
  onPick: (answerId: string) => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="quiz-step" key={question.id}>
      <h3 ref={headingRef} tabIndex={-1} className="quiz-question font-display">
        {question.text}
      </h3>
      <ul className="quiz-answers" role="list">
        {answers.map((answer) => (
          <li key={answer.id}>
            <button
              type="button"
              className="quiz-answer"
              aria-pressed={chosen === answer.id}
              onClick={() => onPick(answer.id)}
            >
              {answer.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
