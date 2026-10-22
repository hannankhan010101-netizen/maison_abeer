import type { CraftKind } from './studioPhotos';

/**
 * "Which workshop are you?": five playful questions that end in a craft.
 *
 * Pure data and one scoring function, so every path through the quiz is pinned
 * by a unit test. The copy is about the guest's mood, never about the studio:
 * no prices, no policy, no promise of what anyone will make.
 */

export interface QuizAnswer {
  id: string;
  label: string;
  scores: Partial<Record<CraftKind, number>>;
}

export interface QuizQuestion {
  id: string;
  text: string;
  answers: QuizAnswer[];
}

export const QUIZ: QuizQuestion[] = [
  {
    id: 'weekend',
    text: 'Your perfect slow Sunday looks like…',
    answers: [
      { id: 'weekend-bake', label: 'Something sweet cooling on the counter', scores: { cake: 2 } },
      { id: 'weekend-mud', label: 'Getting my hands properly messy', scores: { pottery: 2 } },
      {
        id: 'weekend-colour',
        label: 'Music on, colours everywhere',
        scores: { painting: 2 },
      },
    ],
  },
  {
    id: 'friends',
    text: 'In the group chat, you are the one who…',
    answers: [
      {
        id: 'friends-party',
        label: 'Plans the birthday surprise',
        scores: { cake: 2, painting: 1 },
      },
      { id: 'friends-calm', label: 'Keeps everyone calm', scores: { pottery: 2 } },
      {
        id: 'friends-memes',
        label: 'Sends the funniest doodles',
        scores: { painting: 2, cake: 1 },
      },
    ],
  },
  {
    id: 'colour',
    text: 'Pick a colour mood',
    answers: [
      { id: 'colour-pastel', label: 'Soft pastels and sprinkles', scores: { cake: 2 } },
      { id: 'colour-earth', label: 'Warm earth and terracotta', scores: { pottery: 2 } },
      { id: 'colour-bold', label: 'Every bright shade at once', scores: { painting: 2 } },
    ],
  },
  {
    id: 'pace',
    text: 'When you try something new, you like to…',
    answers: [
      {
        id: 'pace-steps',
        label: 'Follow the steps, then add my twist',
        scores: { cake: 2, pottery: 1 },
      },
      { id: 'pace-feel', label: 'Feel my way, slowly', scores: { pottery: 2 } },
      { id: 'pace-free', label: 'Make it up as I go', scores: { painting: 2 } },
    ],
  },
  {
    id: 'keep',
    text: 'The best thing to bring home is…',
    answers: [
      { id: 'keep-share', label: 'Something to share with everyone', scores: { cake: 2 } },
      { id: 'keep-use', label: 'Something I use every morning', scores: { pottery: 2 } },
      { id: 'keep-wall', label: 'Something for my wall', scores: { painting: 2 } },
    ],
  },
];

export const RESULT_COPY: Record<CraftKind, { vibe: string; line: string }> = {
  cake: {
    vibe: 'Sweet little party planner',
    line: 'Frosting, sprinkles and a lot of joy. A bento cake has your name on it.',
  },
  pottery: {
    vibe: 'Calm hands, muddy heart',
    line: 'Slow, steady and happy with clay up to the elbows. The wheel is calling.',
  },
  painting: {
    vibe: 'Colour-everywhere dreamer',
    line: 'Bright, brave and never inside the lines. Grab a brush.',
  },
};

/** `scoreQuiz` was asked to choose among no crafts; the component never asks. */
export class EmptyCraftsError extends Error {
  constructor() {
    super('scoreQuiz needs at least one craft');
    this.name = 'EmptyCraftsError';
  }
}

const ANSWERS = new Map(QUIZ.flatMap((question) => question.answers.map((a) => [a.id, a])));

/**
 * Sums each picked answer's scores over only the crafts in `crafts`. The
 * highest total wins; a tie goes to the craft listed first, and so does a quiz
 * with no known answers. Unknown ids are ignored.
 */
export function scoreQuiz(
  picked: readonly string[],
  crafts: readonly CraftKind[],
): { kind: CraftKind; tied: boolean } {
  const first = crafts[0];
  if (first === undefined) throw new EmptyCraftsError();

  const totals = new Map<CraftKind, number>(crafts.map((kind) => [kind, 0]));
  for (const id of picked) {
    const answer = ANSWERS.get(id);
    if (!answer) continue;
    for (const kind of crafts) {
      totals.set(kind, (totals.get(kind) ?? 0) + (answer.scores[kind] ?? 0));
    }
  }

  let kind = first;
  let best = totals.get(first) ?? 0;
  for (const candidate of crafts) {
    const score = totals.get(candidate) ?? 0;
    if (score > best) {
      kind = candidate;
      best = score;
    }
  }
  const leaders = [...new Set(crafts)].filter((candidate) => (totals.get(candidate) ?? 0) === best);
  return { kind, tied: leaders.length > 1 };
}
