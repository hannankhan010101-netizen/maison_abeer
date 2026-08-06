'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, CardTitle, Eyebrow, HandNote } from '@/components/ui/Card';
import { Field, Modal, inputClasses } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import {
  METRIC_LABELS,
  SUGGESTED_GOALS,
  loadGoals,
  progressFor,
  saveGoals,
  type Goal,
} from '@/lib/wrapped/goals';

/**
 * The manifest board.
 *
 * A goal sitting next to the number that moves it. Kept local to the browser:
 * this is the host's private ambition, and a wish that syncs somewhere feels
 * like a commitment someone else can read.
 */

export interface ManifestBoardProps {
  totals: { guests: number; classes: number; sellouts: number };
}

export function ManifestBoard({ totals }: ManifestBoardProps) {
  const { toast, celebrate } = useToast();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [adding, setAdding] = useState(false);
  const [celebrated, setCelebrated] = useState<Set<string>>(new Set());

  // Read after mount: local storage does not exist during SSR.
  useEffect(() => setGoals(loadGoals()), []);

  const progress = goals.map((goal) => progressFor(goal, totals));

  // Celebrate a goal the first time it lands, not on every render after.
  useEffect(() => {
    const justDone = progress.find((item) => item.isComplete && !celebrated.has(item.goal.id));
    if (!justDone) return;

    celebrate(`${justDone.goal.label} — done 🎀`);
    setCelebrated((current) => new Set(current).add(justDone.goal.id));
  }, [progress, celebrated, celebrate]);

  function persist(next: Goal[]) {
    setGoals(next);
    saveGoals(next);
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Eyebrow className="mb-0">manifest board</Eyebrow>
          <HandNote>what you&rsquo;re working toward ✨</HandNote>
        </div>

        <Button size="sm" onClick={() => setAdding(true)}>
          + set a goal
        </Button>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardTitle>nothing on the board yet</CardTitle>
          <p className="text-latte mt-1 mb-3 text-[13.5px]">
            pick something to aim at. it only lives on this device.
          </p>

          <ul className="grid gap-2">
            {SUGGESTED_GOALS.map((suggestion) => (
              <li key={suggestion.label}>
                <button
                  type="button"
                  onClick={() => persist([...goals, { ...suggestion, id: `goal-${Date.now()}` }])}
                  className="border-line hover:border-pink hover:text-rose-ink min-h-[44px] w-full rounded-[var(--radius-md)] border-[1.5px] border-dashed px-3.5 text-left text-sm font-bold"
                >
                  {suggestion.label}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {progress.map((item) => (
            <li key={item.goal.id}>
              <Card className={cn(item.isComplete && 'border-rose')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle>{item.goal.label}</CardTitle>
                    <p className="text-latte text-xs font-extrabold tracking-[0.06em] uppercase">
                      {METRIC_LABELS[item.goal.metric]}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      persist(goals.filter((goal) => goal.id !== item.goal.id));
                      toast('taken off the board');
                    }}
                    aria-label={`Remove goal: ${item.goal.label}`}
                    className="text-latte hover:text-danger min-h-[44px] px-2"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <b className="font-display text-3xl">{item.current}</b>
                  <span className="text-latte text-sm font-extrabold">/ {item.goal.target}</span>
                </div>

                <div
                  role="progressbar"
                  aria-valuenow={item.current}
                  aria-valuemin={0}
                  aria-valuemax={item.goal.target}
                  aria-label={item.goal.label}
                  className="bg-blush mt-2 h-3 overflow-hidden rounded-[var(--radius-pill)]"
                >
                  <div
                    className={cn(
                      'h-full rounded-[var(--radius-pill)] transition-[width] duration-700',
                      item.isComplete ? 'bg-sage-ink' : 'bg-rose',
                    )}
                    style={{ width: `${Math.round(item.fraction * 100)}%` }}
                  />
                </div>

                <p className="text-latte mt-2 text-[13.5px]">{item.encouragement}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AddGoalModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(goal) => {
          persist([...goals, goal]);
          toast('on the board ✨');
        }}
      />
    </section>
  );
}

function AddGoalModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (goal: Goal) => void;
}) {
  const [label, setLabel] = useState('');
  const [metric, setMetric] = useState<Goal['metric']>('guests');
  const [target, setTarget] = useState(100);

  function submit() {
    onAdd({
      id: `goal-${Date.now()}`,
      label: label.trim() || `${target} ${METRIC_LABELS[metric]}`,
      metric,
      target,
    });

    setLabel('');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="set a goal ✨"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            cancel
          </Button>
          <Button onClick={submit}>put it on the board</Button>
        </>
      }
    >
      <Field
        label="what are you aiming at"
        htmlFor="goal-label"
        hint="optional — we'll name it if you don't"
      >
        <input
          id="goal-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="100 people through the door"
          className={inputClasses}
        />
      </Field>

      <Field label="measured in" htmlFor="goal-metric">
        <select
          id="goal-metric"
          value={metric}
          onChange={(event) => setMetric(event.target.value as Goal['metric'])}
          className={inputClasses}
        >
          {(Object.keys(METRIC_LABELS) as Goal['metric'][]).map((key) => (
            <option key={key} value={key}>
              {METRIC_LABELS[key]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="target" htmlFor="goal-target">
        <input
          id="goal-target"
          type="number"
          min={1}
          value={target}
          onChange={(event) => setTarget(Number(event.target.value))}
          className={inputClasses}
        />
      </Field>

      <p className="text-latte text-xs">stays on this device — nobody else sees it.</p>
    </Modal>
  );
}
