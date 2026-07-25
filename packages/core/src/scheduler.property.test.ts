import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ALL_RATINGS,
  DEFAULT_PARAMS,
  Rating,
  S_MAX,
  S_MIN,
  currentRetrievability,
  intervalDays,
  nextDifficulty,
  nextMemoryState,
  retrievabilityAt,
  review,
  type CardState,
  type MemoryState,
} from "./scheduler.js";

/**
 * Property-based tests.
 *
 * The cross-validation suite proves this implementation matches the reference.
 * That is necessary but not sufficient: two implementations can agree and both
 * be wrong, and "matches the reference" says nothing about the invariants the
 * *application* relies on. These tests assert those invariants over thousands
 * of generated inputs rather than a handful of examples I thought to write down.
 *
 * Each `fc.assert` shrinks failures to a minimal counterexample, so a violation
 * arrives as a reproducible case rather than a mysterious flake.
 */

const RUNS = 2_000;

const arbDifficulty = fc.double({ min: 1, max: 10, noNaN: true, noDefaultInfinity: true });
const arbStability = fc.double({ min: 0.01, max: 3650, noNaN: true, noDefaultInfinity: true });
const arbElapsed = fc.integer({ min: 0, max: 3650 });
const arbRating = fc.constantFrom(...ALL_RATINGS);
const arbMemory: fc.Arbitrary<MemoryState> = fc.record({
  stability: arbStability,
  difficulty: arbDifficulty,
});

describe("scheduler invariants", () => {
  it("difficulty always stays within [1, 10]", () => {
    fc.assert(
      fc.property(arbMemory, arbRating, arbElapsed, (memory, rating, elapsed) => {
        const next = nextMemoryState(memory, rating, elapsed);
        expect(next.difficulty).toBeGreaterThanOrEqual(1);
        expect(next.difficulty).toBeLessThanOrEqual(10);
      }),
      { numRuns: RUNS },
    );
  });

  it("stability always stays within [S_MIN, S_MAX]", () => {
    fc.assert(
      fc.property(arbMemory, arbRating, arbElapsed, (memory, rating, elapsed) => {
        const next = nextMemoryState(memory, rating, elapsed);
        expect(next.stability).toBeGreaterThanOrEqual(S_MIN);
        expect(next.stability).toBeLessThanOrEqual(S_MAX);
      }),
      { numRuns: RUNS },
    );
  });

  it("never produces NaN or Infinity", () => {
    fc.assert(
      fc.property(arbMemory, arbRating, arbElapsed, (memory, rating, elapsed) => {
        const next = nextMemoryState(memory, rating, elapsed);
        expect(Number.isFinite(next.stability)).toBe(true);
        expect(Number.isFinite(next.difficulty)).toBe(true);
        expect(Number.isFinite(intervalDays(next.stability))).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("retrievability is always a probability in (0, 1]", () => {
    fc.assert(
      fc.property(arbStability, arbElapsed, (stability, elapsed) => {
        const r = retrievabilityAt(stability, elapsed);
        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThanOrEqual(1);
      }),
      { numRuns: RUNS },
    );
  });

  it("retrievability never increases as time passes", () => {
    fc.assert(
      fc.property(arbStability, arbElapsed, arbElapsed, (stability, a, b) => {
        const [earlier, later] = a <= b ? [a, b] : [b, a];
        expect(retrievabilityAt(stability, earlier)).toBeGreaterThanOrEqual(
          retrievabilityAt(stability, later),
        );
      }),
      { numRuns: RUNS },
    );
  });

  it("a better rating never yields lower stability", () => {
    // Again ≤ Hard ≤ Good ≤ Easy. This is the property a learner would actually
    // notice being wrong: pressing "Easy" must never bring a card back sooner
    // than pressing "Hard" would have.
    fc.assert(
      fc.property(arbMemory, arbElapsed, (memory, elapsed) => {
        const stabilities = ALL_RATINGS.map(
          (rating) => nextMemoryState(memory, rating, elapsed).stability,
        );
        for (let i = 1; i < stabilities.length; i++) {
          expect(
            stabilities[i]!,
            `rating ${i + 1} produced lower stability than rating ${i}`,
          ).toBeGreaterThanOrEqual(stabilities[i - 1]!);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("a better rating never yields higher difficulty", () => {
    fc.assert(
      fc.property(arbDifficulty, (difficulty) => {
        const difficulties = ALL_RATINGS.map((rating) => nextDifficulty(difficulty, rating, DEFAULT_PARAMS));
        for (let i = 1; i < difficulties.length; i++) {
          expect(
            difficulties[i]!,
            `rating ${i + 1} produced higher difficulty than rating ${i}`,
          ).toBeLessThanOrEqual(difficulties[i - 1]!);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("rating Again never increases stability", () => {
    fc.assert(
      fc.property(arbMemory, fc.integer({ min: 1, max: 3650 }), (memory, elapsed) => {
        const next = nextMemoryState(memory, Rating.Again, elapsed);
        expect(next.stability).toBeLessThanOrEqual(memory.stability);
      }),
      { numRuns: RUNS },
    );
  });

  it("rating Good or Easy on a due card never decreases stability", () => {
    fc.assert(
      fc.property(
        arbMemory,
        fc.integer({ min: 1, max: 3650 }),
        fc.constantFrom(Rating.Good, Rating.Easy),
        (memory, elapsed, rating) => {
          const next = nextMemoryState(memory, rating, elapsed);
          expect(next.stability).toBeGreaterThanOrEqual(memory.stability);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("intervals are at least one day and never exceed the configured maximum", () => {
    fc.assert(
      fc.property(arbStability, (stability) => {
        const days = intervalDays(stability);
        expect(days).toBeGreaterThanOrEqual(1);
        expect(days).toBeLessThanOrEqual(DEFAULT_PARAMS.maximumInterval);
        expect(Number.isInteger(days)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("longer stability never schedules a shorter interval", () => {
    fc.assert(
      fc.property(arbStability, arbStability, (a, b) => {
        const [small, large] = a <= b ? [a, b] : [b, a];
        expect(intervalDays(large)).toBeGreaterThanOrEqual(intervalDays(small));
      }),
      { numRuns: RUNS },
    );
  });

  it("is deterministic: identical inputs produce identical outputs", () => {
    fc.assert(
      fc.property(arbMemory, arbRating, arbElapsed, (memory, rating, elapsed) => {
        expect(nextMemoryState(memory, rating, elapsed)).toEqual(
          nextMemoryState(memory, rating, elapsed),
        );
      }),
      { numRuns: RUNS },
    );
  });
});

describe("review() invariants over full histories", () => {
  const START = new Date("2026-01-01T08:00:00.000Z");

  it("keeps reps and lapses consistent across any rating sequence", () => {
    fc.assert(
      fc.property(fc.array(arbRating, { minLength: 1, maxLength: 40 }), (ratings) => {
        let card: CardState | null = null;
        let expectedLapses = 0;
        let now = START;

        ratings.forEach((rating, index) => {
          const wasLearned = card !== null;
          card = review(card, rating, now, DEFAULT_PARAMS);
          if (wasLearned && rating === Rating.Again) expectedLapses++;

          expect(card.reps).toBe(index + 1);
          expect(card.lapses).toBe(expectedLapses);
          expect(new Date(card.due).getTime()).toBeGreaterThan(now.getTime());
          expect(card.lastReviewedAt).toBe(now.toISOString());
          now = new Date(card.due);
        });
      }),
      { numRuns: 500 },
    );
  });

  it("always schedules the next review strictly in the future", () => {
    fc.assert(
      fc.property(
        fc.array(arbRating, { minLength: 1, maxLength: 25 }),
        fc.array(arbElapsed, { minLength: 25, maxLength: 25 }),
        (ratings, gaps) => {
          let card: CardState | null = null;
          let now = START;
          ratings.forEach((rating, i) => {
            card = review(card, rating, now, DEFAULT_PARAMS);
            expect(new Date(card.due).getTime()).toBeGreaterThan(now.getTime());
            now = new Date(now.getTime() + (gaps[i] ?? 1) * 86_400_000);
          });
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * Reviewing a card at its due date should find recall probability sitting at
   * the retention target (0.9 by default) — that is the scheduler's entire
   * contract.
   *
   * An earlier, sloppier version of this test asserted `r > 0.7` for every
   * history. fast-check refuted it in 43 cases and shrank the counterexample to
   * `[Again, Again, Again]`, which lands at r = 0.636.
   *
   * That is not a defect, it is a boundary of the model. Three lapses drive
   * stability below a single day, but `intervalDays` floors at
   * `max(1, round(S · modifier))` — a day-granularity scheduler cannot show a
   * card in four hours. The card therefore comes back *later* than ideal and
   * has decayed further by the time it does.
   *
   * The two properties below encode that honestly: the target is met whenever
   * the day-floor is not binding, and the floor is the *only* thing that can
   * push retrievability below the target.
   */
  const wellConditioned = (card: CardState): boolean => card.scheduledDays >= 7;

  function replay(ratings: readonly Rating[]): CardState {
    let card: CardState | null = null;
    let now = START;
    for (const rating of ratings) {
      card = review(card, rating, now, DEFAULT_PARAMS);
      now = new Date(card.due);
    }
    return card!;
  }

  it("hits the retention target at the due date whenever the day-floor is not binding", () => {
    fc.assert(
      fc.property(fc.array(arbRating, { minLength: 3, maxLength: 15 }), (ratings) => {
        const card = replay(ratings);
        fc.pre(wellConditioned(card));

        const r = currentRetrievability(card, new Date(card.due), DEFAULT_PARAMS);
        // With an interval of 7+ days, whole-day rounding can shift the target
        // by at most ~0.5%, so this band is tight by construction. A drift
        // between the interval equation and the forgetting curve breaks it.
        expect(r).toBeGreaterThan(0.88);
        expect(r).toBeLessThan(0.92);
      }),
      { numRuns: 1_000 },
    );
  });

  it("only ever undershoots the target when the interval was floored", () => {
    fc.assert(
      fc.property(fc.array(arbRating, { minLength: 1, maxLength: 15 }), (ratings) => {
        const card = replay(ratings);
        const r = currentRetrievability(card, new Date(card.due), DEFAULT_PARAMS);

        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThanOrEqual(1);
        // The contrapositive of the property above: a meaningful undershoot
        // implies a short interval. If a long-interval card ever undershoots,
        // something is genuinely wrong.
        if (r < 0.88) {
          expect(card.scheduledDays).toBeLessThan(7);
        }
      }),
      { numRuns: 1_000 },
    );
  });
});
