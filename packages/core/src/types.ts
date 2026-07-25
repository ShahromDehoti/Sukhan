/**
 * Domain types.
 *
 * These describe the shape of the curriculum as the application reasons about
 * it, deliberately decoupled from how it is stored. The database returns
 * snake_case rows; the mapping into these types happens at the edge, so a
 * column rename cannot ripple through the domain.
 */

/** A single vocabulary item. */
export interface Word {
  readonly id: number;
  readonly tajik: string;
  readonly english: string;
  readonly russian: string;
  /** Latin-script pronunciation guide, e.g. "salom". */
  readonly pronunciationLatin: string;
  /** Cyrillic phonetic guide, for learners who read Russian. */
  readonly pronunciationCyrillic: string;
  readonly category: string;
  /** Storage path for recorded audio, if any. */
  readonly audioPath: string | null;
}

export interface Lesson {
  /** Stable string ID, e.g. "lesson-7". Used as a progress key. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly words: readonly Word[];
}

export interface Unit {
  /** Stable string ID, e.g. "unit-3". Used as a progress key. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly lessons: readonly Lesson[];
}

/**
 * One step in a unit's sequence. Reviews and quizzes are *derived* — they exist
 * only as checkpoints computed from the lesson list, never as stored rows.
 */
export type Checkpoint = LessonCheckpoint | ReviewCheckpoint | QuizCheckpoint;

export interface LessonCheckpoint {
  readonly type: "lesson";
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Index of this lesson within its unit. */
  readonly lessonIndex: number;
  readonly words: readonly Word[];
}

export interface ReviewCheckpoint {
  readonly type: "review";
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Reviews cover every lesson up to and including this index. */
  readonly throughLessonIndex: number;
  /** True for the unit's final review, which covers all of its lessons. */
  readonly isFinal: boolean;
}

export interface QuizCheckpoint {
  readonly type: "quiz";
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

/**
 * A learner's completion record.
 *
 * Sets rather than arrays: every operation the app performs is a membership
 * test, which was O(n) `Array.includes` in the original and is O(1) here. The
 * storage layer is responsible for serialising these to arrays and back.
 */
export interface Progress {
  readonly completedLessons: ReadonlySet<string>;
  readonly completedReviews: ReadonlySet<string>;
  readonly completedQuizzes: ReadonlySet<string>;
}

/** Serialisable form of {@link Progress}, for storage and transport. */
export interface ProgressSnapshot {
  readonly completedLessons: readonly string[];
  readonly completedReviews: readonly string[];
  readonly completedQuizzes: readonly string[];
}
