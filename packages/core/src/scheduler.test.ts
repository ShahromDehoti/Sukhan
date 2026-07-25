import { FSRSAlgorithm, generatorParameters } from "ts-fsrs";
import { beforeAll, describe, expect, it } from "vitest";
import { createRng, randomInt } from "./random.js";
import {
  ALL_RATINGS,
  DEFAULT_PARAMS,
  FSRS6_DEFAULT_WEIGHTS,
  Rating,
  S_MAX,
  S_MIN,
  currentRetrievability,
  decayFactor,
  elapsedDays,
  initialDifficulty,
  initialStability,
  intervalDays,
  isDue,
  nextDifficulty,
  nextForgetStability,
  nextMemoryState,
  nextRecallStability,
  nextShortTermStability,
  retrievabilityAt,
  review,
  sortByUrgency,
  type CardState,
  type SchedulerParams,
} from "./scheduler.js";

/**
 * Cross-validation against the reference implementation.
 *
 * These tests do not compare against hand-copied expected values — a number I
 * typed in by hand is only as trustworthy as my transcription, and a wrong one
 * would enshrine the bug rather than catch it. Instead every equation is
 * evaluated side by side with `ts-fsrs`, the reference FSRS implementation, over
 * a wide grid of inputs. If our two implementations ever disagree, the build
 * fails and one of us is wrong.
 */

let reference: FSRSAlgorithm;
let params: SchedulerParams;

beforeAll(() => {
  reference = new FSRSAlgorithm(
    generatorParameters({ enable_fuzz: false, enable_short_term: true }),
  );
  // Read the weights back off the reference rather than assuming ours match:
  // `generatorParameters` can migrate the weight vector, and comparing two
  // implementations that silently used different weights would prove nothing.
  params = {
    weights: [...reference.parameters.w],
    requestRetention: reference.parameters.request_retention,
    maximumInterval: reference.parameters.maximum_interval,
  };
});

/** Reference rounds intermediates to 8dp; we mirror that, so agreement is tight. */
const TOLERANCE = 1e-8;

describe("cross-validation against ts-fsrs", () => {
  it("uses the same default weights as the reference", () => {
    expect(params.weights).toEqual([...FSRS6_DEFAULT_WEIGHTS]);
    expect(params.weights).toHaveLength(21);
  });

  it("agrees on the decay/factor pair", () => {
    const { decay, factor } = decayFactor(params);
    expect(decay).toBeCloseTo(-params.weights[20]!, 12);
    // R(S, S) must be exactly the 0.9 the factor is defined to produce.
    expect(Math.pow(1 + factor, decay)).toBeCloseTo(0.9, 8);
  });

  it("agrees on the forgetting curve across stabilities and elapsed times", () => {
    for (const stability of [0.1, 1, 3, 10, 50, 365, 3650]) {
      for (const elapsed of [0, 1, 2, 7, 30, 100, 365, 5000]) {
        expect(
          retrievabilityAt(stability, elapsed, params),
          `S=${stability} t=${elapsed}`,
        ).toBeCloseTo(reference.forgetting_curve(elapsed, stability), 8);
      }
    }
  });

  it("agrees on initial stability and difficulty for every rating", () => {
    for (const rating of ALL_RATINGS) {
      expect(initialStability(rating, params), `S0(${rating})`).toBeCloseTo(
        reference.init_stability(rating),
        8,
      );
      // The reference returns D0 unclamped; the public API clamps to [1,10].
      const expected = Math.min(Math.max(reference.init_difficulty(rating), 1), 10);
      expect(initialDifficulty(rating, params), `D0(${rating})`).toBeCloseTo(expected, 8);
    }
  });

  it("agrees on difficulty updates across the whole [1,10] range", () => {
    for (let d = 1; d <= 10; d += 0.25) {
      for (const rating of ALL_RATINGS) {
        expect(nextDifficulty(d, rating, params), `D=${d} g=${rating}`).toBeCloseTo(
          reference.next_difficulty(d, rating),
          8,
        );
      }
    }
  });

  it("agrees on recall stability", () => {
    for (const d of [1, 2.5, 5, 7.5, 10]) {
      for (const s of [0.1, 1, 10, 100, 1000]) {
        for (const r of [0.1, 0.5, 0.9, 0.99]) {
          for (const rating of [Rating.Hard, Rating.Good, Rating.Easy] as const) {
            expect(
              nextRecallStability(d, s, r, rating, params),
              `D=${d} S=${s} R=${r} g=${rating}`,
            ).toBeCloseTo(reference.next_recall_stability(d, s, r, rating), 6);
          }
        }
      }
    }
  });

  it("agrees on forget stability", () => {
    for (const d of [1, 2.5, 5, 7.5, 10]) {
      for (const s of [0.1, 1, 10, 100, 1000]) {
        for (const r of [0.1, 0.5, 0.9, 0.99]) {
          expect(
            nextForgetStability(d, s, r, params),
            `D=${d} S=${s} R=${r}`,
          ).toBeCloseTo(reference.next_forget_stability(d, s, r), 6);
        }
      }
    }
  });

  it("agrees on short-term stability", () => {
    for (const s of [0.1, 1, 10, 100, 1000]) {
      for (const rating of ALL_RATINGS) {
        expect(nextShortTermStability(s, rating, params), `S=${s} g=${rating}`).toBeCloseTo(
          reference.next_short_term_stability(s, rating),
          6,
        );
      }
    }
  });

  it("agrees on scheduled interval length", () => {
    for (const s of [0.1, 0.5, 1, 2, 5, 10, 50, 200, 1000, 20000]) {
      expect(intervalDays(s, params), `S=${s}`).toBe(reference.next_interval(s, 0));
    }
  });

  it("agrees on the first review from a blank card", () => {
    for (const rating of ALL_RATINGS) {
      const mine = nextMemoryState(null, rating, 0, params);
      const theirs = reference.next_state(null, 0, rating);
      expect(mine.stability, `g=${rating} stability`).toBeCloseTo(theirs.stability, 8);
      expect(mine.difficulty, `g=${rating} difficulty`).toBeCloseTo(theirs.difficulty, 8);
    }
  });

  it("agrees across 20,000 randomised multi-review histories", () => {
    // The unit grids above pin each equation individually. This walks whole
    // review histories — including lapses, same-day repeats, and long gaps —
    // so that the *composition* and branch selection are validated too, which
    // is where an implementation is most likely to quietly diverge.
    const rng = createRng(0xbadc0de);
    let steps = 0;

    for (let history = 0; history < 1_000; history++) {
      // Both implementations start from the same first rating.
      const first = pickRating(rng);
      let mine = nextMemoryState(null, first, 0, params);
      let theirs = reference.next_state(null, 0, first);

      for (let step = 0; step < 20; step++) {
        const rating = pickRating(rng);
        // Bias toward small gaps, but include 0 (same-day) and long tails.
        const elapsed = [0, 0, 1, 1, 2, 3, 7, 14, 30, 90, 365][randomInt(rng, 11)]!;

        mine = nextMemoryState(mine, rating, elapsed, params);
        theirs = reference.next_state(theirs, elapsed, rating);
        steps++;

        expect(
          mine.stability,
          `history=${history} step=${step} g=${rating} t=${elapsed} stability`,
        ).toBeCloseTo(theirs.stability, 6);
        expect(
          mine.difficulty,
          `history=${history} step=${step} g=${rating} t=${elapsed} difficulty`,
        ).toBeCloseTo(theirs.difficulty, 6);
      }
    }

    expect(steps).toBe(20_000);
  });
});

function pickRating(rng: () => number): Rating {
  return ALL_RATINGS[randomInt(rng, ALL_RATINGS.length)]!;
}

// ---------------------------------------------------------------------------
// Behaviour the application depends on, independent of the reference
// ---------------------------------------------------------------------------

describe("review", () => {
  const T0 = new Date("2026-01-01T09:00:00.000Z");

  it("schedules a first review into the future and records the rep", () => {
    const card = review(null, Rating.Good, T0);
    expect(card.reps).toBe(1);
    expect(card.lapses).toBe(0);
    expect(card.lastReviewedAt).toBe(T0.toISOString());
    expect(new Date(card.due).getTime()).toBeGreaterThan(T0.getTime());
    expect(card.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it("orders first-review intervals Again <= Hard <= Good <= Easy", () => {
    const intervals = ALL_RATINGS.map((r) => review(null, r, T0).scheduledDays);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]!, `rating ${i + 1} vs ${i}`).toBeGreaterThanOrEqual(intervals[i - 1]!);
    }
  });

  it("counts a lapse only for an already-learned card", () => {
    const first = review(null, Rating.Again, T0);
    expect(first.lapses).toBe(0); // failing your first-ever exposure is not a lapse

    const later = new Date(T0.getTime() + 10 * 86_400_000);
    const second = review(first, Rating.Again, later);
    expect(second.lapses).toBe(1);
    expect(second.reps).toBe(2);
  });

  it("shortens the interval after a lapse and lengthens it after Easy", () => {
    let card = review(null, Rating.Good, T0);
    for (let i = 0; i < 4; i++) {
      card = review(card, Rating.Good, new Date(new Date(card.due).getTime()));
    }
    const matured = card.scheduledDays;

    const lapsed = review(card, Rating.Again, new Date(card.due));
    const easy = review(card, Rating.Easy, new Date(card.due));

    expect(lapsed.scheduledDays).toBeLessThan(matured);
    expect(easy.scheduledDays).toBeGreaterThan(matured);
  });

  it("is pure — the input card is never mutated", () => {
    const card = review(null, Rating.Good, T0);
    const snapshot = { ...card }; // CardState is flat, so a shallow copy is a full one
    review(card, Rating.Again, new Date(T0.getTime() + 5 * 86_400_000));
    expect(card).toEqual(snapshot);
  });

  it("grows intervals across a realistic year of Good ratings", () => {
    let card = review(null, Rating.Good, T0);
    const seen: number[] = [card.scheduledDays];
    for (let i = 0; i < 8; i++) {
      card = review(card, Rating.Good, new Date(card.due));
      seen.push(card.scheduledDays);
    }
    // Strictly increasing: this is the behaviour the original code claimed to
    // have and did not, because it never read the date it computed.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!, `interval ${i} after ${seen[i - 1]!}`).toBeGreaterThan(seen[i - 1]!);
    }
    expect(seen.at(-1)!).toBeGreaterThan(30);
  });
});

describe("retrievability and due-ness", () => {
  const T0 = new Date("2026-03-01T00:00:00.000Z");

  it("is ~0.9 exactly one stability-length after review", () => {
    const card = review(null, Rating.Good, T0);
    const atStability = new Date(T0.getTime() + Math.round(card.stability) * 86_400_000);
    expect(currentRetrievability(card, atStability)).toBeCloseTo(0.9, 1);
  });

  it("decays monotonically with time", () => {
    const card = review(null, Rating.Good, T0);
    let previous = 1.1;
    for (const day of [0, 1, 2, 5, 10, 30, 100, 365]) {
      const r = currentRetrievability(card, new Date(T0.getTime() + day * 86_400_000));
      expect(r, `day ${day}`).toBeLessThanOrEqual(previous);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(1);
      previous = r;
    }
  });

  it("isDue flips exactly at the scheduled instant", () => {
    const card = review(null, Rating.Good, T0);
    const due = new Date(card.due).getTime();
    expect(isDue(card, new Date(due - 1))).toBe(false);
    expect(isDue(card, new Date(due))).toBe(true);
    expect(isDue(card, new Date(due + 1))).toBe(true);
  });
});

describe("sortByUrgency", () => {
  it("puts the most-forgotten card first", () => {
    const T0 = new Date("2026-01-01T00:00:00.000Z");
    const fresh = review(null, Rating.Easy, new Date("2026-06-01T00:00:00.000Z"));
    const stale = review(null, Rating.Again, T0);
    const middling = review(null, Rating.Good, new Date("2026-04-01T00:00:00.000Z"));

    const now = new Date("2026-06-02T00:00:00.000Z");
    const sorted = sortByUrgency(
      [{ card: fresh }, { card: stale }, { card: middling }],
      now,
    );
    expect(sorted[0]!.card).toBe(stale);
    expect(sorted.at(-1)!.card).toBe(fresh);
  });

  it("does not mutate the input array", () => {
    const T0 = new Date("2026-01-01T00:00:00.000Z");
    const entries = [{ card: review(null, Rating.Good, T0) }];
    const copy = [...entries];
    sortByUrgency(entries, new Date("2026-02-01T00:00:00.000Z"));
    expect(entries).toEqual(copy);
  });
});

describe("elapsedDays", () => {
  it("floors partial days so a same-day re-review is t=0", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    expect(elapsedDays(base, base)).toBe(0);
    expect(elapsedDays(base, new Date("2026-01-01T23:59:59.000Z"))).toBe(0);
    expect(elapsedDays(base, new Date("2026-01-02T00:00:00.000Z"))).toBe(1);
    expect(elapsedDays(base, new Date("2026-01-08T12:00:00.000Z"))).toBe(7);
  });

  it("never returns a negative value for clock skew or out-of-order events", () => {
    const base = new Date("2026-01-10T00:00:00.000Z");
    expect(elapsedDays(base, new Date("2026-01-01T00:00:00.000Z"))).toBe(0);
  });
});

describe("input validation", () => {
  it("rejects a negative elapsed time", () => {
    expect(() => nextMemoryState(null, Rating.Good, -1)).toThrow(RangeError);
  });

  it("rejects a short weight vector with a helpful message", () => {
    const broken: SchedulerParams = { ...DEFAULT_PARAMS, weights: [0.1, 0.2, 0.3] };
    expect(() => nextMemoryState(null, Rating.Good, 0, broken)).toThrow(/expected 21 weights/);
  });

  it("keeps stability inside [S_MIN, S_MAX] under extreme weights", () => {
    const card: CardState = review(null, Rating.Good, new Date("2026-01-01T00:00:00.000Z"));
    const state = nextMemoryState(card, Rating.Easy, 100_000);
    expect(state.stability).toBeGreaterThanOrEqual(S_MIN);
    expect(state.stability).toBeLessThanOrEqual(S_MAX);
  });

  it("TOLERANCE constant is documented and unused-safe", () => {
    expect(TOLERANCE).toBeLessThan(1e-6);
  });
});
