import { describe, expect, it } from "vitest";
import { createRng, derange, randomInt, sample, shuffle, type Rng } from "./random.js";

/**
 * The shuffle the original codebase used, in every place it shuffled:
 *
 *     array.sort(() => Math.random() - 0.5)
 *
 * It is kept here — in the test file, never in shipped code — because the point
 * of these tests is to *measure* how wrong it is rather than to assert it on
 * authority. It is the single most common subtly-incorrect snippet in circulation:
 * it reads as obviously fine, and it is not a shuffle at all.
 *
 * Why it fails: `sort` assumes a consistent, transitive comparator. This one
 * returns a different answer every time it is asked about the same pair, so the
 * algorithm's correctness precondition is violated and the output distribution
 * falls out of whichever sort implementation the engine happens to use.
 */
function naiveShuffle<T>(items: readonly T[], rng: Rng): T[] {
  return items.slice().sort(() => rng() - 0.5);
}

/**
 * Chi-square goodness-of-fit over the full position matrix.
 *
 * `counts[i][j]` is how often the element that started at index `i` finished at
 * index `j`. A uniform shuffle sends each element to each position equally
 * often, so every cell has the same expected value. The statistic sums the
 * squared, normalised deviation across all n² cells.
 */
function positionChiSquare(
  shuffleFn: (items: readonly number[], rng: Rng) => number[],
  n: number,
  trials: number,
  seed: number,
): number {
  const rng = createRng(seed);
  const identity = Array.from({ length: n }, (_, i) => i);
  const counts: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let t = 0; t < trials; t++) {
    const result = shuffleFn(identity, rng);
    for (let position = 0; position < n; position++) {
      const origin = result[position]!;
      const row = counts[origin]!;
      row[position] = (row[position]!) + 1;
    }
  }

  const expected = trials / n;
  let chiSquare = 0;
  for (const row of counts) {
    for (const observed of row) {
      const delta = observed - expected;
      chiSquare += (delta * delta) / expected;
    }
  }
  return chiSquare;
}

describe("shuffle", () => {
  const N = 5;
  const TRIALS = 200_000;
  const SEED = 0xc0ffee;
  // Chi-square critical value, (n-1)² = 16 degrees of freedom, p = 0.001.
  // A correct shuffle exceeds this roughly one run in a thousand — and because
  // the generator is seeded, "roughly" becomes "never": the value is fixed.
  const CRITICAL_16DF_P001 = 39.25;

  it("is uniform over positions (chi-square below the p=0.001 critical value)", () => {
    const chiSquare = positionChiSquare(shuffle, N, TRIALS, SEED);
    expect(chiSquare).toBeLessThan(CRITICAL_16DF_P001);
  });

  it("stays uniform across many independent seeds", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const chiSquare = positionChiSquare(shuffle, N, 20_000, seed);
      expect(
        chiSquare,
        `seed ${seed} produced chi-square ${chiSquare.toFixed(2)}`,
      ).toBeLessThan(CRITICAL_16DF_P001);
    }
  });

  it("demonstrates that the sort-comparator idiom is NOT uniform", () => {
    const good = positionChiSquare(shuffle, N, TRIALS, SEED);
    const bad = positionChiSquare(naiveShuffle, N, TRIALS, SEED);

    // The naive version is not marginally worse, it is worse by orders of
    // magnitude — far past any reasonable significance threshold.
    expect(bad).toBeGreaterThan(CRITICAL_16DF_P001 * 10);
    expect(bad).toBeGreaterThan(good * 50);
  });

  it("preserves the multiset of elements", () => {
    const rng = createRng(99);
    const input = ["a", "b", "c", "d", "e", "f"];
    for (let i = 0; i < 100; i++) {
      expect([...shuffle(input, rng)].sort()).toEqual([...input].sort());
    }
  });

  it("does not mutate its input", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input, createRng(7));
    expect(input).toEqual(copy);
  });

  it("handles empty and single-element arrays", () => {
    const rng = createRng(1);
    expect(shuffle([], rng)).toEqual([]);
    expect(shuffle([42], rng)).toEqual([42]);
  });
});

describe("derange", () => {
  it("never leaves an element at its original index", () => {
    const rng = createRng(2024);
    for (let n = 2; n <= 12; n++) {
      const identity = Array.from({ length: n }, (_, i) => i);
      for (let trial = 0; trial < 2_000; trial++) {
        const result = derange(identity, rng);
        for (let i = 0; i < n; i++) {
          expect(result[i], `n=${n} trial=${trial} index=${i}`).not.toBe(i);
        }
      }
    }
  });

  it("preserves the multiset of elements", () => {
    const rng = createRng(5);
    const input = [10, 20, 30, 40, 50];
    for (let i = 0; i < 500; i++) {
      expect([...derange(input, rng)].sort((a, b) => a - b)).toEqual(input);
    }
  });

  it("returns short arrays unchanged, since no derangement exists", () => {
    const rng = createRng(3);
    expect(derange([], rng)).toEqual([]);
    expect(derange(["only"], rng)).toEqual(["only"]);
  });

  it("reaches every element of the output space for n=3", () => {
    // The cyclic permutations of 3 items are exactly the two derangements,
    // so for n=3 Sattolo's output IS uniform over derangements. Both must appear.
    const rng = createRng(11);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(derange([0, 1, 2], rng).join(""));
    expect(seen).toEqual(new Set(["120", "201"]));
  });
});

describe("sample", () => {
  it("returns the requested count without replacement", () => {
    const rng = createRng(17);
    const pool = Array.from({ length: 20 }, (_, i) => i);
    for (let i = 0; i < 200; i++) {
      const picked = sample(pool, 5, rng);
      expect(picked).toHaveLength(5);
      expect(new Set(picked).size).toBe(5);
      for (const value of picked) expect(pool).toContain(value);
    }
  });

  it("returns everything when asked for at least the pool size", () => {
    const rng = createRng(18);
    const pool = [1, 2, 3];
    expect(sample(pool, 3, rng).sort()).toEqual([1, 2, 3]);
    expect(sample(pool, 99, rng).sort()).toEqual([1, 2, 3]);
  });

  it("returns nothing for non-positive counts", () => {
    const rng = createRng(19);
    expect(sample([1, 2, 3], 0, rng)).toEqual([]);
    expect(sample([1, 2, 3], -1, rng)).toEqual([]);
  });
});

describe("createRng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(123);
    const b = createRng(123);
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it("produces different streams for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const drawsA = Array.from({ length: 50 }, a);
    const drawsB = Array.from({ length: 50 }, b);
    expect(drawsA).not.toEqual(drawsB);
  });

  it("stays within [0, 1)", () => {
    const rng = createRng(4242);
    for (let i = 0; i < 100_000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("randomInt stays in range", () => {
    const rng = createRng(31337);
    for (let i = 0; i < 10_000; i++) {
      const value = randomInt(rng, 7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
  });
});
