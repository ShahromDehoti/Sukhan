/**
 * Deterministic randomness for the domain core.
 *
 * Every function here takes an explicit `Rng` rather than calling `Math.random()`.
 * That is what makes shuffling and item-selection testable: a seeded generator
 * turns "assert the distribution is uniform" from a flaky test into a
 * reproducible one, and lets the server and client agree on a quiz layout by
 * agreeing on a seed.
 */

/** A pseudo-random source returning a float in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 — a 32-bit PRNG chosen for being small, fast, and well-distributed
 * enough for shuffling. It is NOT cryptographically secure and must never be
 * used to generate tokens, IDs, or anything security-relevant.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return function mulberry32(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in [0, maxExclusive). */
export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

/**
 * Fisher-Yates shuffle — every permutation equally likely.
 *
 * This replaces `array.sort(() => Math.random() - 0.5)`, which was used
 * throughout the original implementation. That idiom is not a shuffle: it hands
 * a non-transitive, inconsistent comparator to a sort algorithm, and the
 * resulting distribution is both badly skewed and engine-dependent. See
 * `random.test.ts`, which measures the skew rather than asserting it.
 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    // i and j are both in [0, out.length) by construction, so these reads are
    // total despite noUncheckedIndexedAccess.
    const atI = out[i] as T;
    const atJ = out[j] as T;
    out[i] = atJ;
    out[j] = atI;
  }
  return out;
}

/** Take `count` items uniformly at random, without replacement. */
export function sample<T>(items: readonly T[], count: number, rng: Rng): T[] {
  if (count >= items.length) return shuffle(items, rng);
  return shuffle(items, rng).slice(0, Math.max(0, count));
}

/**
 * Sattolo's algorithm — a shuffle with **no fixed points**: no element can end
 * up at the index it started from.
 *
 * The quiz needs this so a Tajik word never lines up with its own translation.
 * The original code approximated it by reshuffling up to 50 times and hoping
 * for a derangement, which could (rarely) fall through and emit a giveaway.
 * Sattolo's is O(n), always succeeds, and needs no retry loop.
 *
 * Precise guarantee: this returns a uniformly random *cyclic* permutation.
 * Cyclic permutations are a strict subset of derangements, so this is NOT
 * uniform over all derangements. That is a deliberate trade: the property the
 * quiz depends on is "no item keeps its index", and every output satisfies it.
 *
 * Arrays of length < 2 have no derangement, so they are returned as-is; callers
 * that care must check the length themselves.
 */
export function derange<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  if (out.length < 2) return out;
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i); // strictly less than i — this is what forbids fixed points
    const atI = out[i] as T;
    const atJ = out[j] as T;
    out[i] = atJ;
    out[j] = atI;
  }
  return out;
}
