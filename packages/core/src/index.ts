/**
 * `@sukhan/core` — the pure domain.
 *
 * Everything exported here is a total function over plain data: no network, no
 * storage, no clock, no DOM. `Date` and randomness are always injected by the
 * caller. That is what lets the API server and the web client share one
 * implementation of scheduling and progression, and what lets the test suite
 * simulate years of review history in milliseconds.
 */

export type {
  Checkpoint,
  Lesson,
  LessonCheckpoint,
  Progress,
  ProgressSnapshot,
  QuizCheckpoint,
  ReviewCheckpoint,
  Unit,
  Word,
} from "./types.js";

export {
  EMPTY_PROGRESS,
  buildCheckpoints,
  completeCheckpoint,
  fromSnapshot,
  isCheckpointComplete,
  isCheckpointUnlocked,
  nextCheckpointIndex,
  toSnapshot,
  unitCompletion,
  wordsForReview,
  wordsInUnit,
  type UnitCompletion,
} from "./curriculum.js";

export {
  ALL_RATINGS,
  DEFAULT_PARAMS,
  FSRS6_DEFAULT_WEIGHTS,
  Rating,
  S_MAX,
  S_MIN,
  currentRetrievability,
  elapsedDays,
  intervalDays,
  isDue,
  nextMemoryState,
  retrievabilityAt,
  review,
  sortByUrgency,
  type CardState,
  type MemoryState,
  type SchedulerParams,
} from "./scheduler.js";

export {
  REVIEW_COVERAGE,
  buildQuiz,
  reviewSessionSize,
  scoreQuiz,
  selectReviewWords,
  type BuildQuizOptions,
  type Quiz,
  type QuizResult,
  type ReviewCandidate,
  type SelectReviewOptions,
} from "./session.js";

export { createRng, derange, randomInt, sample, shuffle, type Rng } from "./random.js";
