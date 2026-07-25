import { describe, expect, it } from "vitest";
import { createRng } from "./random.js";
import { Rating, review, type CardState } from "./scheduler.js";
import {
  REVIEW_COVERAGE,
  buildQuiz,
  reviewSessionSize,
  scoreQuiz,
  selectReviewWords,
  type ReviewCandidate,
} from "./session.js";
import type { Word } from "./types.js";

const DAY = 86_400_000;
const NOW = new Date("2026-06-01T12:00:00.000Z");

function makeWord(id: number): Word {
  return {
    id,
    tajik: `tajik-${id}`,
    english: `english-${id}`,
    russian: `russian-${id}`,
    pronunciationLatin: `lat-${id}`,
    pronunciationCyrillic: `cyr-${id}`,
    category: "test",
    audioPath: null,
  };
}

/** A card last reviewed `daysAgo` and scheduled `dueInDays` from now. */
function cardReviewedAt(daysAgo: number, rating: Rating = Rating.Good): CardState {
  return review(null, rating, new Date(NOW.getTime() - daysAgo * DAY));
}

describe("selectReviewWords", () => {
  const rng = () => createRng(42)();

  it("puts due cards before unseen words, and unseen before not-yet-due", () => {
    // A card rated Good and left for a year is long overdue.
    const overdue: ReviewCandidate = { word: makeWord(1), card: cardReviewedAt(365) };
    const unseen: ReviewCandidate = { word: makeWord(2), card: null };
    // Rated Easy moments ago — comfortably in the future.
    const fresh: ReviewCandidate = { word: makeWord(3), card: cardReviewedAt(0, Rating.Easy) };

    const selected = selectReviewWords([fresh, unseen, overdue], {
      now: NOW,
      limit: 10,
      rng: createRng(1),
    });

    expect(selected.map((w) => w.id)).toEqual([1, 2, 3]);
  });

  it("orders due cards by urgency, most-forgotten first", () => {
    const candidates: ReviewCandidate[] = [
      { word: makeWord(10), card: cardReviewedAt(30) },
      { word: makeWord(11), card: cardReviewedAt(400) }, // most decayed
      { word: makeWord(12), card: cardReviewedAt(60) },
    ];

    const selected = selectReviewWords(candidates, { now: NOW, limit: 10, rng: createRng(2) });
    expect(selected[0]!.id).toBe(11);
    expect(selected.map((w) => w.id)).toEqual([11, 12, 10]);
  });

  it("respects the session limit", () => {
    const candidates: ReviewCandidate[] = Array.from({ length: 20 }, (_, i) => ({
      word: makeWord(i),
      card: cardReviewedAt(100 + i),
    }));
    expect(selectReviewWords(candidates, { now: NOW, limit: 5, rng: createRng(3) })).toHaveLength(5);
  });

  it("returns nothing for a non-positive limit", () => {
    const candidates: ReviewCandidate[] = [{ word: makeWord(1), card: null }];
    expect(selectReviewWords(candidates, { now: NOW, limit: 0, rng: createRng(4) })).toEqual([]);
    expect(selectReviewWords(candidates, { now: NOW, limit: -3, rng: createRng(4) })).toEqual([]);
  });

  it("falls back to not-yet-due cards rather than returning an empty session", () => {
    // Nothing is due. The learner asked to review, so give them something.
    const candidates: ReviewCandidate[] = [
      { word: makeWord(1), card: cardReviewedAt(0, Rating.Easy) },
      { word: makeWord(2), card: cardReviewedAt(0, Rating.Easy) },
    ];
    const selected = selectReviewWords(candidates, { now: NOW, limit: 5, rng: createRng(5) });
    expect(selected).toHaveLength(2);
  });

  it("handles an empty candidate list", () => {
    expect(selectReviewWords([], { now: NOW, limit: 5, rng: createRng(6) })).toEqual([]);
  });

  it("does not repeat a word within a session", () => {
    const candidates: ReviewCandidate[] = Array.from({ length: 30 }, (_, i) => ({
      word: makeWord(i),
      card: i % 2 === 0 ? cardReviewedAt(200) : null,
    }));
    const selected = selectReviewWords(candidates, { now: NOW, limit: 20, rng: createRng(7) });
    expect(new Set(selected.map((w) => w.id)).size).toBe(selected.length);
  });

  it("is reproducible for a fixed seed", () => {
    const candidates: ReviewCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      word: makeWord(i),
      card: null,
    }));
    const a = selectReviewWords(candidates, { now: NOW, limit: 5, rng: createRng(99) });
    const b = selectReviewWords(candidates, { now: NOW, limit: 5, rng: createRng(99) });
    expect(a.map((w) => w.id)).toEqual(b.map((w) => w.id));
    void rng;
  });
});

describe("reviewSessionSize", () => {
  it("covers ~70% of the candidate pool", () => {
    expect(REVIEW_COVERAGE).toBe(0.7);
    expect(reviewSessionSize(10)).toBe(7);
    expect(reviewSessionSize(20)).toBe(14);
    expect(reviewSessionSize(3)).toBe(2);
  });

  it("always includes at least one word when any exist", () => {
    expect(reviewSessionSize(1)).toBe(1);
    expect(reviewSessionSize(2)).toBe(1);
  });

  it("returns zero for an empty pool", () => {
    expect(reviewSessionSize(0)).toBe(0);
    expect(reviewSessionSize(-5)).toBe(0);
  });

  it("accepts a custom coverage", () => {
    expect(reviewSessionSize(10, 1)).toBe(10);
    expect(reviewSessionSize(10, 0.5)).toBe(5);
  });
});

describe("buildQuiz", () => {
  const pool = Array.from({ length: 12 }, (_, i) => makeWord(i + 1));

  it("never places a word opposite its own translation", () => {
    // The property the original's 50-retry loop only approximated.
    const rng = createRng(0xd00d);
    for (let trial = 0; trial < 2_000; trial++) {
      const quiz = buildQuiz(pool, { count: 5, rng });
      quiz.prompts.forEach((prompt, i) => {
        expect(quiz.choices[i]!.id, `trial ${trial} row ${i}`).not.toBe(prompt.id);
        expect(quiz.answerKey[i], `trial ${trial} row ${i}`).not.toBe(i);
      });
    }
  });

  it("builds a correct answer key", () => {
    const rng = createRng(11);
    for (let trial = 0; trial < 500; trial++) {
      const quiz = buildQuiz(pool, { count: 5, rng });
      quiz.prompts.forEach((prompt, i) => {
        expect(quiz.choices[quiz.answerKey[i]!]!.id).toBe(prompt.id);
      });
    }
  });

  it("uses the same word set on both sides", () => {
    const quiz = buildQuiz(pool, { count: 6, rng: createRng(12) });
    expect(quiz.prompts.map((w) => w.id).sort()).toEqual(quiz.choices.map((w) => w.id).sort());
  });

  it("asks for no more words than the pool holds", () => {
    const small = pool.slice(0, 3);
    const quiz = buildQuiz(small, { count: 10, rng: createRng(13) });
    expect(quiz.prompts).toHaveLength(3);
    expect(quiz.answerKey).toHaveLength(3);
  });

  it("handles degenerate pools without throwing", () => {
    expect(buildQuiz([], { count: 5, rng: createRng(14) }).prompts).toEqual([]);
    const single = buildQuiz([makeWord(1)], { count: 5, rng: createRng(15) });
    expect(single.prompts).toHaveLength(1);
    // A lone word cannot be deranged; it maps to itself rather than crashing.
    expect(single.answerKey).toEqual([0]);
  });

  it("draws different prompt sets across successive draws", () => {
    const rng = createRng(16);
    const draws = new Set<string>();
    for (let i = 0; i < 50; i++) {
      draws.add(
        buildQuiz(pool, { count: 5, rng })
          .prompts.map((w) => w.id)
          .sort((a, b) => a - b)
          .join(","),
      );
    }
    expect(draws.size).toBeGreaterThan(1);
  });
});

describe("scoreQuiz", () => {
  const pool = Array.from({ length: 8 }, (_, i) => makeWord(i + 1));

  it("scores a flawless attempt as perfect", () => {
    const quiz = buildQuiz(pool, { count: 5, rng: createRng(20) });
    const matches = new Map(quiz.answerKey.map((choiceIndex, i) => [i, choiceIndex]));

    const result = scoreQuiz(quiz, matches);
    expect(result).toMatchObject({ correct: 5, total: 5, isPerfect: true });
    expect(result.correctness).toEqual([true, true, true, true, true]);
  });

  it("scores a partial attempt without marking it perfect", () => {
    const quiz = buildQuiz(pool, { count: 5, rng: createRng(21) });
    const matches = new Map(quiz.answerKey.map((choiceIndex, i) => [i, choiceIndex]));
    // Break one row by pointing it at a different choice.
    matches.set(0, (quiz.answerKey[0]! + 1) % quiz.choices.length);

    const result = scoreQuiz(quiz, matches);
    expect(result.correct).toBe(4);
    expect(result.isPerfect).toBe(false);
    expect(result.correctness[0]).toBe(false);
  });

  it("treats unanswered rows as incorrect", () => {
    const quiz = buildQuiz(pool, { count: 5, rng: createRng(22) });
    const result = scoreQuiz(quiz, new Map());
    expect(result.correct).toBe(0);
    expect(result.isPerfect).toBe(false);
    expect(result.correctness.every((c) => c === false)).toBe(true);
  });

  it("does not call an empty quiz perfect", () => {
    const quiz = buildQuiz([], { count: 5, rng: createRng(23) });
    expect(scoreQuiz(quiz, new Map()).isPerfect).toBe(false);
  });
});
