import { describe, expect, it } from 'vitest';

import { EmptyCraftsError, QUIZ, RESULT_COPY, scoreQuiz } from './quiz';
import type { CraftKind } from './studioPhotos';

const ALL: CraftKind[] = ['cake', 'pottery', 'painting'];
const FORBIDDEN = /[$£€]|\bRs\.?\b|\bPKR\b|\bfree\b|\bincluded\b|guarantee|refund|\bdiscount\b/i;
const PROMISE = /\byou will\b|\byou'll\b|\byou’ll\b|\bwe promise\b|\bprice\b/i;

/** Every way of picking one answer per question. */
function allPaths(): string[][] {
  return QUIZ.reduce<string[][]>(
    (paths, question) =>
      paths.flatMap((path) => question.answers.map((answer) => [...path, answer.id])),
    [[]],
  );
}

describe('QUIZ', () => {
  it('has five questions of three answers, with unique ids', () => {
    expect(QUIZ).toHaveLength(5);
    for (const question of QUIZ) expect(question.answers).toHaveLength(3);
    const ids = QUIZ.flatMap((question) => [question.id, ...question.answers.map((a) => a.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has copy with no digits, currency or studio promises', () => {
    const copy = [
      ...QUIZ.flatMap((question) => [question.text, ...question.answers.map((a) => a.label)]),
      ...Object.values(RESULT_COPY).flatMap((result) => [result.vibe, result.line]),
    ];
    for (const text of copy) {
      expect(text.trim()).not.toBe('');
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(FORBIDDEN);
      expect(text).not.toMatch(PROMISE);
    }
  });
});

describe('scoreQuiz', () => {
  const subsets: CraftKind[][] = [
    ALL,
    ['pottery', 'painting'],
    ['painting', 'cake'],
    ['cake', 'pottery'],
    ['painting'],
  ];

  it('always ends in a craft the studio teaches', () => {
    for (const crafts of subsets) {
      for (const path of allPaths()) {
        expect(crafts).toContain(scoreQuiz(path, crafts).kind);
      }
    }
  });

  it('can reach every craft when all three are taught', () => {
    const reached = new Set(allPaths().map((path) => scoreQuiz(path, ALL).kind));
    expect([...reached].sort()).toEqual([...ALL].sort());
  });

  it('breaks ties by the order of crafts, deterministically', () => {
    expect(scoreQuiz([], ['pottery', 'cake'])).toEqual({ kind: 'pottery', tied: true });
    expect(scoreQuiz([], ['cake', 'pottery'])).toEqual({ kind: 'cake', tied: true });
    for (const path of allPaths().slice(0, 40)) {
      expect(scoreQuiz(path, ALL)).toEqual(scoreQuiz(path, ALL));
    }
  });

  it('returns the only craft when restricted to one', () => {
    for (const path of allPaths().slice(0, 30)) {
      expect(scoreQuiz(path, ['painting']).kind).toBe('painting');
    }
  });

  it('ignores unknown answer ids', () => {
    const path = allPaths()[7]!;
    expect(scoreQuiz([...path, 'nope', ''], ALL)).toEqual(scoreQuiz(path, ALL));
    expect(scoreQuiz(['nope'], ['painting', 'cake'])).toEqual({ kind: 'painting', tied: true });
  });

  it('throws a typed error for no crafts', () => {
    expect(() => scoreQuiz([], [])).toThrow(EmptyCraftsError);
  });
});
