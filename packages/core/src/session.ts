/**
 * Choosing what to show in a review or quiz session.
 *
 * ## What changed
 *
 * The original picked review words by looking at each word's *most recent
 * rating*: anything last marked `again` or `hard` was prioritised, then the
 * remainder was topped up at random to hit 70% coverage. Time never entered the
 * calculation, so a word rated `hard` a year ago and one rated `hard` this
 * morning were treated identically — and the `nextReview` date the scheduler
 * carefully computed was never consulted.
 *
 * Selection here is driven by retrievability: the learner sees the words they
 * are closest to forgetting, which is the entire point of running a scheduler.
 */

import { derange, sample, shuffle, type Rng } from "./random.js";
import {
  DEFAULT_PARAMS,
  currentRetrievability,
  isDue,
  type CardState,
  type SchedulerParams,
} from "./scheduler.js";
import type { Word } from "./types.js";

/** A word paired with its review history, if it has one. */
export interface ReviewCandidate {
  readonly word: Word;
  /** `null` for a word the learner has never been shown. */
  readonly card: CardState | null;
}

export interface SelectReviewOptions {
  readonly now: Date;
  /** Maximum words in the session. */
  readonly limit: number;
  readonly rng: Rng;
  readonly params?: SchedulerParams;
}

/**
 * Order candidates for a review session and take the first `limit`.
 *
 * Priority, in order:
 *   1. **Due cards**, most urgent first — lowest recall probability leads.
 *   2. **Unseen words**, shuffled. A word introduced in a lesson but never
 *      rated has no schedule yet and should be picked up early.
 *   3. **Not-yet-due cards**, most urgent first, to fill a short session rather
 *      than showing the learner an empty screen.
 *
 * Ties inside a bucket are broken by the supplied `rng`, so two sessions built
 * from identical state are not identical in order — but a session built from a
 * fixed seed is reproducible, which is what makes this testable.
 */
export function selectReviewWords(
  candidates: readonly ReviewCandidate[],
  options: SelectReviewOptions,
): Word[] {
  const { now, limit, rng, params = DEFAULT_PARAMS } = options;
  if (limit <= 0) return [];

  const due: { word: Word; retrievability: number }[] = [];
  const unseen: Word[] = [];
  const upcoming: { word: Word; retrievability: number }[] = [];

  for (const { word, card } of candidates) {
    if (card === null) {
      unseen.push(word);
    } else if (isDue(card, now)) {
      due.push({ word, retrievability: currentRetrievability(card, now, params) });
    } else {
      upcoming.push({ word, retrievability: currentRetrievability(card, now, params) });
    }
  }

  const byUrgency = (a: { retrievability: number }, b: { retrievability: number }): number =>
    a.retrievability - b.retrievability;

  return [
    ...shuffle(due, rng).sort(byUrgency).map((entry) => entry.word),
    ...shuffle(unseen, rng),
    ...shuffle(upcoming, rng).sort(byUrgency).map((entry) => entry.word),
  ].slice(0, limit);
}

/**
 * How many words a review checkpoint should cover.
 *
 * The original hard-coded 70% coverage in two near-identical functions
 * (`getMidUnitReviewWords` and `getEndUnitReviewWords`, whose bodies differed
 * only in one argument). One function, one constant.
 */
export const REVIEW_COVERAGE = 0.7;

export function reviewSessionSize(candidateCount: number, coverage = REVIEW_COVERAGE): number {
  if (candidateCount <= 0) return 0;
  return Math.max(1, Math.round(candidateCount * coverage));
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

export interface Quiz {
  /** Left column: shown to the learner as Tajik. */
  readonly prompts: readonly Word[];
  /** Right column: the same words in a different order, shown as English. */
  readonly choices: readonly Word[];
  /** `answerKey[promptIndex]` is the index in `choices` that matches. */
  readonly answerKey: readonly number[];
}

export interface BuildQuizOptions {
  readonly count: number;
  readonly rng: Rng;
}

/**
 * Build a matching quiz.
 *
 * The choices are a *derangement* of the prompts, so no word ever sits opposite
 * its own translation. The original approximated this by reshuffling up to 50
 * times and accepting whatever it had on the 50th attempt — which could, and
 * occasionally did, present a giveaway row. It also used a biased shuffle, so
 * items disproportionately stayed near their original position, making the
 * correct pairing guessable from layout alone. See `random.ts`.
 */
export function buildQuiz(words: readonly Word[], options: BuildQuizOptions): Quiz {
  const { count, rng } = options;
  const prompts = sample(words, Math.min(count, words.length), rng);

  // A single word cannot be deranged against itself; present it as-is.
  const choices = prompts.length < 2 ? prompts : derange(prompts, rng);

  const positionById = new Map<number, number>();
  choices.forEach((word, index) => positionById.set(word.id, index));

  const answerKey = prompts.map((prompt) => {
    const index = positionById.get(prompt.id);
    if (index === undefined) {
      throw new Error(`Quiz invariant violated: prompt ${prompt.id} is absent from choices`);
    }
    return index;
  });

  return { prompts, choices, answerKey };
}

/**
 * Score a learner's matching attempt.
 *
 * `matches[promptIndex]` is the choice index they selected, or `undefined` if
 * they left that row blank.
 */
export interface QuizResult {
  readonly correct: number;
  readonly total: number;
  /** True only for a flawless attempt — what gates the checkpoint. */
  readonly isPerfect: boolean;
  /** Per-prompt correctness, aligned with `quiz.prompts`. */
  readonly correctness: readonly boolean[];
}

export function scoreQuiz(quiz: Quiz, matches: ReadonlyMap<number, number>): QuizResult {
  const correctness = quiz.answerKey.map(
    (expected, promptIndex) => matches.get(promptIndex) === expected,
  );
  const correct = correctness.filter(Boolean).length;
  return {
    correct,
    total: quiz.prompts.length,
    isPerfect: quiz.prompts.length > 0 && correct === quiz.prompts.length,
    correctness,
  };
}
