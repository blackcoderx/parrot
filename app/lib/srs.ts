import "server-only";

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  State,
  type Card,
  type Grade as FsrsGrade,
} from "ts-fsrs";
import type { CardStatus, Grade } from "@/types";

/** A card's FSRS memory state as stored in `flashcards.srs` (JSON, dates as epoch ms). */
export interface Srs {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review: number | null;
}

// FSRS defaults: aim to be shown each card when recall has dropped to 90%. Fuzz nudges due
// dates by a little so cards studied together don't stay bunched; short-term mode adds the
// 1m / 10m learning steps before a new or forgotten card moves to day-long intervals.
const scheduler = fsrs(
  generatorParameters({ request_retention: 0.9, enable_fuzz: true, enable_short_term: true }),
);

const GRADES = [1, 2, 3, 4] as const satisfies readonly Grade[];

// Stability (days until recall falls to 90%) at which a card counts as familiar / confident /
// mastered. 21 days matches Anki's "mature" cutoff.
const CONFIDENT_DAYS = 7;
const MASTERED_DAYS = 21;

function toCard(srs: Srs | null, now: number): Card {
  if (!srs) return createEmptyCard(now);
  const { due, last_review, ...rest } = srs;
  return { ...rest, due: new Date(due), last_review: last_review === null ? undefined : new Date(last_review) };
}

function fromCard(card: Card): Srs {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null,
  };
}

/** Grade a card (null = never studied) at `now`; returns its next memory state. */
export function review(srs: Srs | null, grade: Grade, now: number): Srs {
  return fromCard(scheduler.next(toCard(srs, now), now, grade as FsrsGrade).card);
}

/** Milliseconds until the card would be due again after each grade, Again..Easy. */
export function intervals(srs: Srs | null, now: number): [number, number, number, number] {
  const preview = scheduler.repeat(toCard(srs, now), now);
  const [again, hard, good, easy] = GRADES.map(
    (g) => preview[g as FsrsGrade].card.due.getTime() - now,
  );
  return [again, hard, good, easy];
}

export function statusOf(srs: Srs | null): CardStatus {
  if (!srs || srs.state === State.New) return "new";
  if (srs.state !== State.Review) return "learning"; // Learning, or Relearning after a lapse
  if (srs.stability >= MASTERED_DAYS) return "mastered";
  if (srs.stability >= CONFIDENT_DAYS) return "confident";
  return "familiar";
}
