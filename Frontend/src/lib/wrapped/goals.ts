/**
 * The manifest board.
 *
 * Hosts building a personal brand already set goals — in notes apps, on
 * paper, in their head. Putting the goal next to the number that moves it is
 * the whole feature: progress the host does not have to calculate is progress
 * they will actually notice.
 *
 * Goals live in local storage. They are the host's private ambition, not
 * studio data, and shipping them to a server would make a wish feel like a
 * commitment someone else can read.
 */

export interface Goal {
  id: string;
  metric: 'guests' | 'classes' | 'sellouts';
  target: number;
  label: string;
}

export interface GoalProgress {
  goal: Goal;
  current: number;
  fraction: number;
  remaining: number;
  isComplete: boolean;
  /** Copy that reacts to how close they are. */
  encouragement: string;
}

export const GOAL_STORAGE_KEY = 'maison-abeer-goals';

export const METRIC_LABELS: Record<Goal['metric'], string> = {
  guests: 'guests taught',
  classes: 'classes run',
  sellouts: 'sold-out classes',
};

/** Starter goals, so an empty board still suggests what one looks like. */
export const SUGGESTED_GOALS: Omit<Goal, 'id'>[] = [
  { metric: 'guests', target: 100, label: '100 people through the door' },
  { metric: 'classes', target: 12, label: 'a class every week for a season' },
  { metric: 'sellouts', target: 5, label: 'five sold-out classes' },
];

/**
 * Copy that changes with distance.
 *
 * A single "keep going" for every state reads like it was never really
 * looking. These are deliberately different in kind, not just in wording.
 */
export function encouragementFor(
  fraction: number,
  remaining: number,
  metric: Goal['metric'],
): string {
  if (fraction >= 1) return 'done. that was you 🎀';
  if (fraction >= 0.9) return `${remaining} to go — genuinely almost there`;
  if (fraction >= 0.5) return 'past halfway, which is the hard part';
  if (fraction >= 0.2) return 'it is moving. that counts';
  if (fraction > 0) return `${remaining} ${METRIC_LABELS[metric]} to go — early days`;

  return 'nothing yet, and that is a fine place to start';
}

export function progressFor(
  goal: Goal,
  totals: { guests: number; classes: number; sellouts: number },
): GoalProgress {
  const current = totals[goal.metric] ?? 0;
  const target = Math.max(1, goal.target);
  const fraction = Math.min(1, current / target);
  const remaining = Math.max(0, target - current);

  return {
    goal,
    current,
    fraction,
    remaining,
    isComplete: current >= target,
    encouragement: encouragementFor(fraction, remaining, goal.metric),
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function isGoal(value: unknown): value is Goal {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.target === 'number' &&
    (candidate.metric === 'guests' ||
      candidate.metric === 'classes' ||
      candidate.metric === 'sellouts')
  );
}

/**
 * Read goals, discarding anything malformed.
 *
 * Local storage is editable by hand and survives across versions, so its
 * contents are untrusted input like any other.
 */
export function loadGoals(): Goal[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(GOAL_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isGoal);
  } catch {
    return [];
  }
}

export function saveGoals(goals: Goal[]): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goals));
  } catch {
    // Private browsing can refuse storage. Losing a goal is a small harm;
    // throwing on the render path is a larger one.
  }
}
