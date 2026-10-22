'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { haptic, useMotionTier } from '@/lib/motion';
import { QUIZ, RESULT_COPY, scoreQuiz } from '@/lib/public/quiz';
import { saveStory } from '@/lib/public/storyCanvas';
import { storyModel } from '@/lib/public/storyCard';
import type { CraftKind } from '@/lib/public/studioPhotos';

import { QuizResult, type ShareState } from './QuizResult';
import { QuizStep } from './QuizStep';

import '@/styles/units/quiz.css';

/**
 * "Which workshop are you?": five quick questions that end in one of the crafts
 * the studio teaches, a vibe line, a way to book it and a Story picture to
 * share. A studio with one craft has nothing to choose, so it renders nothing.
 *
 * Focus follows the guest: each new question (and the result) takes focus on
 * its heading, so the quiz runs end to end by keyboard. Back keeps every answer.
 */

const TINT: Record<CraftKind, string> = {
  cake: 'bento',
  pottery: 'pottery',
  painting: 'painting',
};

function tintStyle(kind: CraftKind | null): CSSProperties | undefined {
  if (!kind) return undefined;
  return {
    '--quiz-tint': `var(--craft-${TINT[kind]})`,
    '--quiz-ink': `var(--craft-${TINT[kind]}-ink)`,
  } as CSSProperties;
}

export default function WhichWorkshop({
  crafts,
  onBook,
  handle = null,
}: {
  crafts: CraftKind[];
  onBook: (kind: CraftKind) => void;
  /** The studio's Instagram handle for the Story picture; none means no handle line. */
  handle?: string | null;
}) {
  const kinds = [...new Set(crafts)];
  const tier = useMotionTier();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [share, setShare] = useState<ShareState>('idle');
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current) return;
    heading.current?.focus();
  }, [step]);

  if (kinds.length < 2) return null;

  const done = step >= QUIZ.length;
  const question = QUIZ[Math.min(step, QUIZ.length - 1)]!;
  const kind = done ? scoreQuiz(answers, kinds).kind : null;

  const go = (next: number) => {
    moved.current = true;
    setStep(next);
  };

  const pick = (answerId: string) => {
    haptic('tap');
    setAnswers((previous) => {
      const next = [...previous];
      next[step] = answerId;
      return next;
    });
    setShare('idle');
    go(step + 1);
  };

  const shareStory = async () => {
    if (!kind || share === 'busy') return;
    setShare('busy');
    const outcome = await saveStory(
      storyModel({ kind, ...RESULT_COPY[kind], handle: handle ?? null }),
    );
    if (outcome === 'failed') setShare('failed');
    else if (outcome === 'cancelled') setShare('idle');
    else {
      haptic('success');
      setShare(outcome === 'shared' ? 'shared' : 'saved');
    }
  };

  return (
    <section
      className={tier > 0 ? 'quiz is-animated' : 'quiz'}
      aria-labelledby="quiz-title"
      style={tintStyle(kind)}
    >
      <p className="quiz-kicker font-hand">a little quiz</p>
      <h2 id="quiz-title" className="quiz-title font-display">
        Which workshop are you?
      </h2>

      <div className="quiz-card" key={done ? 'result' : question.id}>
        {done && kind ? (
          <QuizResult
            kind={kind}
            share={share}
            headingRef={heading}
            onBook={() => {
              haptic('success');
              onBook(kind);
            }}
            onShare={() => void shareStory()}
            onRestart={() => {
              setAnswers([]);
              setShare('idle');
              go(0);
            }}
          />
        ) : (
          <>
            <div
              className="quiz-progress"
              role="progressbar"
              aria-label="Quiz progress"
              aria-valuemin={1}
              aria-valuemax={QUIZ.length}
              aria-valuenow={step + 1}
              aria-valuetext={`Question ${step + 1} of ${QUIZ.length}`}
            >
              <span
                className="quiz-progress-fill"
                style={{ transform: `scaleX(${(step + 1) / QUIZ.length})` }}
              />
            </div>
            <QuizStep
              question={question}
              chosen={answers[step]}
              onPick={pick}
              headingRef={heading}
            />
            {step > 0 ? (
              <button type="button" className="quiz-back" onClick={() => go(step - 1)}>
                Back
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
