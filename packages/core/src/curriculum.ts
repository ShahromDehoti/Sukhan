/**
 * Curriculum structure and progression rules.
 *
 * ## What changed from the original
 *
 * The original `progress.js` mixed three concerns: it read and wrote
 * `localStorage` *inside* functions that otherwise looked pure, it exported an
 * unlock rule nothing called, and it kept the rule the app actually used inline
 * in `App.jsx`. Two consequences followed:
 *
 *  - Nothing was testable, because every query touched global browser state.
 *  - The two unlock rules could drift, and had: the exported
 *    `isLessonUnlocked` contained an `if` block that returned
 *    `previousLessonComplete` on both branches — a conditional with no effect,
 *    guarding a rule that was never consulted.
 *
 * Here, every function is pure and takes the learner's `Progress` explicitly.
 * Storage happens at the edges. There is exactly one unlock rule.
 *
 * ## Checkpoint IDs are a compatibility surface
 *
 * The `lesson-N` / `review-<unit>-<n>` / `review-<unit>-end` / `quiz-<unit>`
 * ID formats are preserved byte-for-byte from the original implementation.
 * Learners have progress recorded under these keys in `localStorage`; changing
 * the format would silently reset everyone's progress on deploy.
 */

import type {
  Checkpoint,
  Progress,
  ProgressSnapshot,
  Unit,
} from "./types.js";

/** A learner who has done nothing yet. */
export const EMPTY_PROGRESS: Progress = {
  completedLessons: new Set(),
  completedReviews: new Set(),
  completedQuizzes: new Set(),
};

/** Insert a mid-unit review after every N lessons. */
const LESSONS_PER_REVIEW = 2;

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

export function toSnapshot(progress: Progress): ProgressSnapshot {
  return {
    completedLessons: [...progress.completedLessons],
    completedReviews: [...progress.completedReviews],
    completedQuizzes: [...progress.completedQuizzes],
  };
}

/**
 * Rebuild progress from stored data.
 *
 * Tolerant by design: this parses whatever `localStorage` or an API happens to
 * hold, including data written by the pre-TypeScript version, partial objects,
 * and outright garbage. A learner with a corrupt record should start from zero,
 * not see a crashed application.
 */
export function fromSnapshot(raw: unknown): Progress {
  const source = (raw ?? {}) as Partial<Record<keyof ProgressSnapshot, unknown>>;
  return {
    completedLessons: toStringSet(source.completedLessons),
    completedReviews: toStringSet(source.completedReviews),
    completedQuizzes: toStringSet(source.completedQuizzes),
  };
}

function toStringSet(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((entry): entry is string => typeof entry === "string"));
}

// ---------------------------------------------------------------------------
// Checkpoint construction
// ---------------------------------------------------------------------------

/**
 * Expand a unit into its ordered sequence of checkpoints:
 * lessons, a review after every two of them, a final review, then the quiz.
 *
 * A mid-unit review is skipped when it would land immediately before the final
 * review — otherwise a unit with an even lesson count would ask the learner to
 * review the same material twice in a row.
 */
export function buildCheckpoints(unit: Unit): Checkpoint[] {
  const checkpoints: Checkpoint[] = [];
  const lessons = unit.lessons;

  lessons.forEach((lesson, index) => {
    checkpoints.push({
      type: "lesson",
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      lessonIndex: index,
      words: lesson.words,
    });

    const isReviewPoint = (index + 1) % LESSONS_PER_REVIEW === 0;
    const isLastLesson = index === lessons.length - 1;
    if (isReviewPoint && !isLastLesson) {
      checkpoints.push({
        type: "review",
        id: `review-${unit.id}-${index + 1}`,
        title: "Review",
        description: `Review words from lessons 1–${index + 1}`,
        throughLessonIndex: index,
        isFinal: false,
      });
    }
  });

  if (lessons.length > 0) {
    checkpoints.push({
      type: "review",
      id: `review-${unit.id}-end`,
      title: "Final Review",
      description: "Review all words from this unit",
      throughLessonIndex: lessons.length - 1,
      isFinal: true,
    });
    checkpoints.push({
      type: "quiz",
      id: `quiz-${unit.id}`,
      title: "Unit Quiz",
      description: "Match Tajik words with their translations",
    });
  }

  return checkpoints;
}

/** Every word covered by a review checkpoint, in lesson order, de-duplicated. */
export function wordsForReview(unit: Unit, checkpoint: Checkpoint): Unit["lessons"][number]["words"] {
  if (checkpoint.type !== "review") return [];
  const seen = new Set<number>();
  const words = [];
  for (const lesson of unit.lessons.slice(0, checkpoint.throughLessonIndex + 1)) {
    for (const word of lesson.words) {
      if (seen.has(word.id)) continue;
      seen.add(word.id);
      words.push(word);
    }
  }
  return words;
}

/** Every word in a unit, in lesson order, de-duplicated. */
export function wordsInUnit(unit: Unit): Unit["lessons"][number]["words"] {
  const seen = new Set<number>();
  const words = [];
  for (const lesson of unit.lessons) {
    for (const word of lesson.words) {
      if (seen.has(word.id)) continue;
      seen.add(word.id);
      words.push(word);
    }
  }
  return words;
}

// ---------------------------------------------------------------------------
// Completion and unlocking — one rule, one place
// ---------------------------------------------------------------------------

export function isCheckpointComplete(checkpoint: Checkpoint, progress: Progress): boolean {
  switch (checkpoint.type) {
    case "lesson":
      return progress.completedLessons.has(checkpoint.id);
    case "review":
      return progress.completedReviews.has(checkpoint.id);
    case "quiz":
      return progress.completedQuizzes.has(checkpoint.id);
  }
}

/**
 * A checkpoint is unlocked when **every** checkpoint before it is complete.
 *
 * This single rule replaces the original's four overlapping ones
 * (`isLessonUnlocked`, `isReviewUnlocked`, `isEndReviewUnlocked`,
 * `isQuizUnlocked`), two of which ignored parameters they were passed and one
 * of which was never called at all.
 *
 * Note "every preceding" rather than "the immediately preceding one". For a
 * learner progressing normally the two are equivalent, since each checkpoint
 * gates the next. They diverge on *gapped* progress — all lessons complete but
 * a mid-unit review missing — which cannot happen through the UI but readily
 * happens when two devices' records are merged, when storage is hand-edited, or
 * when data is migrated from an older schema. Under the weaker rule such a gap
 * would hand the learner the final review and quiz for free; under this one the
 * gap must be filled first.
 */
export function isCheckpointUnlocked(
  checkpoints: readonly Checkpoint[],
  index: number,
  progress: Progress,
): boolean {
  if (index <= 0) return true;
  if (index >= checkpoints.length) return false;
  for (let i = 0; i < index; i++) {
    if (!isCheckpointComplete(checkpoints[i]!, progress)) return false;
  }
  return true;
}

/** Index of the next checkpoint to work on, or -1 when the unit is finished. */
export function nextCheckpointIndex(
  checkpoints: readonly Checkpoint[],
  progress: Progress,
): number {
  return checkpoints.findIndex((checkpoint) => !isCheckpointComplete(checkpoint, progress));
}

// ---------------------------------------------------------------------------
// Immutable progress updates
// ---------------------------------------------------------------------------

/**
 * Record a checkpoint as complete, returning new progress.
 *
 * Returns the *same object* when the checkpoint was already complete, so
 * callers can use referential equality to skip redundant writes and re-renders.
 */
export function completeCheckpoint(progress: Progress, checkpoint: Checkpoint): Progress {
  if (isCheckpointComplete(checkpoint, progress)) return progress;

  switch (checkpoint.type) {
    case "lesson":
      return { ...progress, completedLessons: withValue(progress.completedLessons, checkpoint.id) };
    case "review":
      return { ...progress, completedReviews: withValue(progress.completedReviews, checkpoint.id) };
    case "quiz":
      return { ...progress, completedQuizzes: withValue(progress.completedQuizzes, checkpoint.id) };
  }
}

function withValue(set: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(set);
  next.add(value);
  return next;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface UnitCompletion {
  /** Checkpoints finished. */
  readonly completed: number;
  /** Checkpoints in the unit. */
  readonly total: number;
  /** Completed lessons only — what the unit card's "3 / 5 lessons" line shows. */
  readonly completedLessons: number;
  readonly totalLessons: number;
  /** Fraction in [0, 1], for the progress bar. 0 for an empty unit. */
  readonly ratio: number;
  /** True once every checkpoint, including the quiz, is done. */
  readonly isComplete: boolean;
}

export function unitCompletion(unit: Unit, progress: Progress): UnitCompletion {
  const checkpoints = buildCheckpoints(unit);
  const completed = checkpoints.filter((c) => isCheckpointComplete(c, progress)).length;
  const completedLessons = unit.lessons.filter((lesson) =>
    progress.completedLessons.has(lesson.id),
  ).length;

  return {
    completed,
    total: checkpoints.length,
    completedLessons,
    totalLessons: unit.lessons.length,
    ratio: checkpoints.length === 0 ? 0 : completed / checkpoints.length,
    isComplete: checkpoints.length > 0 && completed === checkpoints.length,
  };
}
