import { describe, expect, it } from "vitest";
import {
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
} from "./curriculum.js";
import type { Progress, Unit, Word } from "./types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let nextWordId = 1;

function makeWord(tajik: string): Word {
  return {
    id: nextWordId++,
    tajik,
    english: `${tajik}-en`,
    russian: `${tajik}-ru`,
    pronunciationLatin: tajik,
    pronunciationCyrillic: tajik,
    category: "test",
    audioPath: null,
  };
}

function makeUnit(id: string, lessonCount: number, wordsPerLesson = 3): Unit {
  return {
    id,
    title: `Unit ${id}`,
    description: "",
    lessons: Array.from({ length: lessonCount }, (_, i) => ({
      id: `lesson-${id}-${i + 1}`,
      title: `Lesson ${i + 1}`,
      description: "",
      words: Array.from({ length: wordsPerLesson }, (_, w) => makeWord(`w${i}-${w}`)),
    })),
  };
}

/** Walk the unit start to finish, completing every checkpoint in order. */
function completeAll(unit: Unit): Progress {
  return buildCheckpoints(unit).reduce(
    (progress, checkpoint) => completeCheckpoint(progress, checkpoint),
    EMPTY_PROGRESS,
  );
}

// ---------------------------------------------------------------------------

describe("buildCheckpoints", () => {
  it("interleaves a review after every two lessons, then a final review and quiz", () => {
    const shape = buildCheckpoints(makeUnit("unit-1", 5)).map((c) => c.type);
    expect(shape).toEqual([
      "lesson",
      "lesson",
      "review", // after lessons 1–2
      "lesson",
      "lesson",
      "review", // after lessons 3–4
      "lesson",
      "review", // final
      "quiz",
    ]);
  });

  it("skips the mid-unit review when it would sit immediately before the final review", () => {
    // 4 lessons: a review would naturally fall after lesson 4, but the final
    // review covers the same ground, so the learner would review twice in a row.
    const shape = buildCheckpoints(makeUnit("unit-1", 4)).map((c) => c.type);
    expect(shape).toEqual(["lesson", "lesson", "review", "lesson", "lesson", "review", "quiz"]);
    expect(shape.filter((t) => t === "review")).toHaveLength(2);
  });

  it.each([
    [1, 3],
    [2, 4],
    [3, 6],
    [4, 7],
    [5, 9],
    [6, 10],
  ])("produces the right checkpoint count for %i lessons", (lessons, expected) => {
    expect(buildCheckpoints(makeUnit("unit-1", lessons))).toHaveLength(expected);
  });

  it("produces nothing for an empty unit", () => {
    // The original pushed a final review with throughLessonIndex -1 and a quiz
    // over zero words. Guarding on lesson count removes that latent bug.
    expect(buildCheckpoints(makeUnit("unit-empty", 0))).toEqual([]);
  });

  it("preserves the exact legacy checkpoint ID format", () => {
    // These strings are a compatibility surface: learners have progress stored
    // under them. A change here silently resets everyone on deploy.
    const ids = buildCheckpoints(makeUnit("unit-3", 5)).map((c) => c.id);
    expect(ids).toEqual([
      "lesson-unit-3-1",
      "lesson-unit-3-2",
      "review-unit-3-2",
      "lesson-unit-3-3",
      "lesson-unit-3-4",
      "review-unit-3-4",
      "lesson-unit-3-5",
      "review-unit-3-end",
      "quiz-unit-3",
    ]);
  });

  it("marks exactly one review as final, and it covers the last lesson", () => {
    const checkpoints = buildCheckpoints(makeUnit("unit-1", 5));
    const finals = checkpoints.filter((c) => c.type === "review" && c.isFinal);
    expect(finals).toHaveLength(1);
    expect(finals[0]).toMatchObject({ throughLessonIndex: 4, id: "review-unit-1-end" });
  });
});

describe("unlocking", () => {
  const unit = makeUnit("unit-1", 5);
  const checkpoints = buildCheckpoints(unit);

  it("unlocks only the first checkpoint for a new learner", () => {
    expect(isCheckpointUnlocked(checkpoints, 0, EMPTY_PROGRESS)).toBe(true);
    for (let i = 1; i < checkpoints.length; i++) {
      expect(isCheckpointUnlocked(checkpoints, i, EMPTY_PROGRESS), `index ${i}`).toBe(false);
    }
  });

  it("advances exactly one checkpoint at a time", () => {
    let progress = EMPTY_PROGRESS;
    for (let i = 0; i < checkpoints.length; i++) {
      expect(isCheckpointUnlocked(checkpoints, i, progress), `index ${i} should be open`).toBe(true);
      expect(
        isCheckpointUnlocked(checkpoints, i + 1, progress),
        `index ${i + 1} should still be locked`,
      ).toBe(false);
      progress = completeCheckpoint(progress, checkpoints[i]!);
    }
  });

  it("does not hand out the final review and quiz when progress has gaps", () => {
    // Every lesson complete but the mid-unit reviews missing. Unreachable
    // through the UI, but exactly what merging two devices' records can
    // produce — so the gap must be filled before the unit can be finished.
    const quizIndex = checkpoints.length - 1;
    const finalReviewIndex = checkpoints.length - 2;

    const lessonsOnly = checkpoints
      .filter((c) => c.type === "lesson")
      .reduce(completeCheckpoint, EMPTY_PROGRESS);

    expect(isCheckpointUnlocked(checkpoints, finalReviewIndex, lessonsOnly)).toBe(false);
    expect(isCheckpointUnlocked(checkpoints, quizIndex, lessonsOnly)).toBe(false);
    // The unlock rule points the learner back at the gap.
    expect(nextCheckpointIndex(checkpoints, lessonsOnly)).toBe(2);

    const everything = completeAll(unit);
    expect(isCheckpointUnlocked(checkpoints, quizIndex, everything)).toBe(true);
  });

  it("treats out-of-range indices safely", () => {
    expect(isCheckpointUnlocked(checkpoints, -5, EMPTY_PROGRESS)).toBe(true);
    expect(isCheckpointUnlocked(checkpoints, 999, EMPTY_PROGRESS)).toBe(false);
    expect(isCheckpointUnlocked([], 0, EMPTY_PROGRESS)).toBe(true);
  });
});

describe("nextCheckpointIndex", () => {
  const unit = makeUnit("unit-1", 3);
  const checkpoints = buildCheckpoints(unit);

  it("points at the first incomplete checkpoint", () => {
    expect(nextCheckpointIndex(checkpoints, EMPTY_PROGRESS)).toBe(0);
    const afterFirst = completeCheckpoint(EMPTY_PROGRESS, checkpoints[0]!);
    expect(nextCheckpointIndex(checkpoints, afterFirst)).toBe(1);
  });

  it("returns -1 once the unit is finished", () => {
    expect(nextCheckpointIndex(checkpoints, completeAll(unit))).toBe(-1);
  });
});

describe("completeCheckpoint", () => {
  const checkpoints = buildCheckpoints(makeUnit("unit-1", 3));

  it("does not mutate the progress it is given", () => {
    const before = toSnapshot(EMPTY_PROGRESS);
    completeCheckpoint(EMPTY_PROGRESS, checkpoints[0]!);
    expect(toSnapshot(EMPTY_PROGRESS)).toEqual(before);
  });

  it("returns the identical object when nothing changes", () => {
    // Referential equality lets callers skip redundant persistence and renders.
    const once = completeCheckpoint(EMPTY_PROGRESS, checkpoints[0]!);
    const twice = completeCheckpoint(once, checkpoints[0]!);
    expect(twice).toBe(once);
  });

  it("files each checkpoint type under the right bucket", () => {
    const lesson = checkpoints.find((c) => c.type === "lesson")!;
    const reviewCp = checkpoints.find((c) => c.type === "review")!;
    const quiz = checkpoints.find((c) => c.type === "quiz")!;

    const progress = [lesson, reviewCp, quiz].reduce(completeCheckpoint, EMPTY_PROGRESS);

    expect(progress.completedLessons.has(lesson.id)).toBe(true);
    expect(progress.completedReviews.has(reviewCp.id)).toBe(true);
    expect(progress.completedQuizzes.has(quiz.id)).toBe(true);
    expect(isCheckpointComplete(lesson, progress)).toBe(true);
  });
});

describe("snapshot round-trip", () => {
  it("survives a round trip unchanged", () => {
    const unit = makeUnit("unit-1", 3);
    const progress = completeAll(unit);
    const restored = fromSnapshot(toSnapshot(progress));
    expect(toSnapshot(restored)).toEqual(toSnapshot(progress));
  });

  it("reads data written by the pre-TypeScript version", () => {
    const legacy = {
      completedLessons: ["lesson-1-1", "lesson-1-2"],
      completedReviews: ["review-unit-1-2"],
      completedQuizzes: [],
    };
    const progress = fromSnapshot(legacy);
    expect(progress.completedLessons.has("lesson-1-1")).toBe(true);
    expect(progress.completedReviews.has("review-unit-1-2")).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "not an object"],
    ["a number", 42],
    ["an empty object", {}],
    ["partial data", { completedLessons: ["a"] }],
    ["wrong element types", { completedLessons: [1, null, "keep", {}] }],
    ["non-array fields", { completedLessons: "nope", completedQuizzes: 7 }],
  ])("degrades gracefully for %s rather than throwing", (_label, input) => {
    expect(() => fromSnapshot(input)).not.toThrow();
    const progress = fromSnapshot(input);
    expect(progress.completedLessons).toBeInstanceOf(Set);
    expect(progress.completedReviews).toBeInstanceOf(Set);
    expect(progress.completedQuizzes).toBeInstanceOf(Set);
  });

  it("keeps only string entries from a mixed array", () => {
    const progress = fromSnapshot({ completedLessons: [1, null, "keep", {}, "also"] });
    expect([...progress.completedLessons]).toEqual(["keep", "also"]);
  });

  it("de-duplicates repeated entries", () => {
    const progress = fromSnapshot({ completedLessons: ["a", "a", "b"] });
    expect([...progress.completedLessons]).toEqual(["a", "b"]);
  });
});

describe("word collection", () => {
  it("gathers every word up to a review's cutoff, in lesson order", () => {
    const unit = makeUnit("unit-1", 5, 2);
    const checkpoints = buildCheckpoints(unit);
    const midReview = checkpoints.find((c) => c.type === "review" && !c.isFinal)!;

    const words = wordsForReview(unit, midReview);
    // Covers lessons 1–2 only: 2 lessons × 2 words.
    expect(words).toHaveLength(4);
    expect(words.map((w) => w.tajik)).toEqual(["w0-0", "w0-1", "w1-0", "w1-1"]);
  });

  it("gathers the whole unit for the final review", () => {
    const unit = makeUnit("unit-1", 3, 2);
    const finalReview = buildCheckpoints(unit).find((c) => c.type === "review" && c.isFinal)!;
    expect(wordsForReview(unit, finalReview)).toHaveLength(6);
    expect(wordsForReview(unit, finalReview)).toEqual(wordsInUnit(unit));
  });

  it("returns nothing for a non-review checkpoint", () => {
    const unit = makeUnit("unit-1", 3);
    const lesson = buildCheckpoints(unit)[0]!;
    expect(wordsForReview(unit, lesson)).toEqual([]);
  });

  it("de-duplicates a word that appears in more than one lesson", () => {
    const shared = makeWord("shared");
    const unit: Unit = {
      id: "unit-1",
      title: "",
      description: "",
      lessons: [
        { id: "l1", title: "", description: "", words: [shared, makeWord("a")] },
        { id: "l2", title: "", description: "", words: [shared, makeWord("b")] },
      ],
    };
    const words = wordsInUnit(unit);
    expect(words).toHaveLength(3);
    expect(words.filter((w) => w.id === shared.id)).toHaveLength(1);
  });
});

describe("unitCompletion", () => {
  it("reports zero for an untouched unit", () => {
    const unit = makeUnit("unit-1", 5);
    expect(unitCompletion(unit, EMPTY_PROGRESS)).toEqual({
      completed: 0,
      total: 9,
      completedLessons: 0,
      totalLessons: 5,
      ratio: 0,
      isComplete: false,
    });
  });

  it("reports full completion once every checkpoint is done", () => {
    const unit = makeUnit("unit-1", 5);
    const result = unitCompletion(unit, completeAll(unit));
    expect(result.ratio).toBe(1);
    expect(result.isComplete).toBe(true);
    expect(result.completedLessons).toBe(5);
  });

  it("counts lessons separately from total checkpoints", () => {
    const unit = makeUnit("unit-1", 5);
    const progress = buildCheckpoints(unit)
      .filter((c) => c.type === "lesson")
      .reduce(completeCheckpoint, EMPTY_PROGRESS);

    const result = unitCompletion(unit, progress);
    expect(result.completedLessons).toBe(5);
    expect(result.completed).toBe(5); // reviews and quiz still outstanding
    expect(result.total).toBe(9);
    expect(result.isComplete).toBe(false);
  });

  it("does not divide by zero for an empty unit", () => {
    const result = unitCompletion(makeUnit("unit-empty", 0), EMPTY_PROGRESS);
    expect(result.ratio).toBe(0);
    expect(result.isComplete).toBe(false);
    expect(Number.isNaN(result.ratio)).toBe(false);
  });

  it("ignores progress belonging to a different unit", () => {
    const unitOne = makeUnit("unit-1", 3);
    const unitTwo = makeUnit("unit-2", 3);
    const result = unitCompletion(unitTwo, completeAll(unitOne));
    expect(result.completed).toBe(0);
  });
});
