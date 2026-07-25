/**
 * FSRS-6 spaced-repetition scheduler.
 *
 * ## Why this exists
 *
 * The original implementation computed a `nextReview` date on every rating and
 * then never read it. Review selection sorted purely by the most recent rating,
 * so the "spaced repetition" was not spaced by anything — a word rated `good`
 * six months ago and one rated `good` this morning were indistinguishable. This
 * module makes scheduling real.
 *
 * ## What this implements
 *
 * FSRS-6 (Free Spaced Repetition Scheduler), the same algorithm and default
 * weights used by the reference `ts-fsrs` implementation. `scheduler.test.ts`
 * cross-validates every function here against that library rather than against
 * hand-copied expected values, so a divergence fails the build.
 *
 * Two deliberate differences from the reference:
 *
 *  1. **No interval fuzz.** The reference can jitter intervals ±5% to spread
 *     review load. That injects nondeterminism into a pure function, and Sukhan
 *     is too small for review-clumping to matter. Omitted.
 *  2. **No learning steps.** The reference models Anki's learning/relearning
 *     step queues (`State.Learning`, `State.Relearning`). Sukhan has no such
 *     queue — a word is either unseen or scheduled — so cards go straight to
 *     review state.
 *
 * Intermediate values are rounded to 8 decimal places exactly as the reference
 * does. That is not cosmetic: it means cross-validation can assert near-exact
 * equality, so any mismatch is a real defect rather than accumulated float noise.
 */

/** Ratings a learner can give, matching the four review buttons. */
export const Rating = {
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
} as const;

export type Rating = (typeof Rating)[keyof typeof Rating];

export const ALL_RATINGS: readonly Rating[] = [
  Rating.Again,
  Rating.Hard,
  Rating.Good,
  Rating.Easy,
];

/** Minimum representable stability, in days. */
export const S_MIN = 0.001;
/** Maximum stability / interval, in days (100 years). */
export const S_MAX = 36500;

/**
 * FSRS-6 default weights (w0..w20). w20 is the decay term, new in FSRS-6.
 * These are the published defaults, fitted across a large review corpus; they
 * are a sane prior, not tuned for Tajik learners specifically. Retuning them
 * against real review logs is a genuine future improvement.
 */
export const FSRS6_DEFAULT_WEIGHTS: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

export interface SchedulerParams {
  /** 21 FSRS-6 weights. */
  readonly weights: readonly number[];
  /** Target probability of recall at review time. 0.9 = "I want to remember 90%". */
  readonly requestRetention: number;
  /** Hard cap on any scheduled interval, in days. */
  readonly maximumInterval: number;
}

export const DEFAULT_PARAMS: SchedulerParams = {
  weights: FSRS6_DEFAULT_WEIGHTS,
  requestRetention: 0.9,
  maximumInterval: S_MAX,
};

/**
 * The two-number memory model FSRS maintains per card.
 *  - `stability`: days until recall probability decays to 90%.
 *  - `difficulty`: 1..10, how much work this item costs this learner.
 */
export interface MemoryState {
  readonly stability: number;
  readonly difficulty: number;
}

/** Everything persisted about one word's review history. */
export interface CardState extends MemoryState {
  /** ISO-8601 instant this card next becomes due. */
  readonly due: string;
  /** ISO-8601 instant of the most recent review. */
  readonly lastReviewedAt: string;
  /** Total reviews, including lapses. */
  readonly reps: number;
  /** Times this card was rated `Again` after having been learned. */
  readonly lapses: number;
  /** Days scheduled at the most recent review. */
  readonly scheduledDays: number;
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Round to 8 decimal places, matching the reference implementation. */
function roundTo8(value: number): number {
  const factor = 1e8;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function weightAt(params: SchedulerParams, index: number): number {
  const w = params.weights[index];
  if (w === undefined) {
    throw new RangeError(
      `FSRS weight w${index} is missing; expected 21 weights, received ${params.weights.length}`,
    );
  }
  return w;
}

const MS_PER_DAY = 86_400_000;

/**
 * Whole days between two instants, floored and never negative.
 *
 * Floored rather than rounded so that a review 23 hours after the last one
 * counts as same-day (t=0) and takes the short-term stability path — which is
 * the behaviour the algorithm's short-term branch is designed for.
 */
export function elapsedDays(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY));
}

// ---------------------------------------------------------------------------
// FSRS-6 core equations
// ---------------------------------------------------------------------------

/** decay = -w20; factor is chosen so that R(S, S) = 0.9 exactly. */
export function decayFactor(params: SchedulerParams): { decay: number; factor: number } {
  const decay = -weightAt(params, 20);
  const factor = roundTo8(Math.exp(Math.log(0.9) / decay) - 1);
  return { decay, factor };
}

/**
 * Forgetting curve: probability of recall `t` days after a review, given stability.
 *
 *   R(t, S) = (1 + factor · t/S) ^ decay
 */
export function retrievabilityAt(
  stability: number,
  elapsed: number,
  params: SchedulerParams = DEFAULT_PARAMS,
): number {
  const { decay, factor } = decayFactor(params);
  return roundTo8(Math.pow(1 + (factor * elapsed) / stability, decay));
}

/** S₀(G) — stability after the very first review. */
export function initialStability(rating: Rating, params: SchedulerParams): number {
  return Math.max(weightAt(params, rating - 1), 0.1);
}

/** D₀(G) = w4 − e^((G−1)·w5) + 1, clamped to [1, 10]. */
export function initialDifficulty(rating: Rating, params: SchedulerParams): number {
  const d = weightAt(params, 4) - Math.exp((rating - 1) * weightAt(params, 5)) + 1;
  return clamp(roundTo8(d), 1, 10);
}

/**
 * Difficulty update: a linear-damped delta, then mean reversion toward D₀(Easy).
 * Damping by (10 − D)/9 means difficulty moves less the closer it already is to
 * the ceiling, which stops a run of `Again` ratings pinning every card at 10.
 */
export function nextDifficulty(
  difficulty: number,
  rating: Rating,
  params: SchedulerParams,
): number {
  const deltaD = -weightAt(params, 6) * (rating - 3);
  const damped = roundTo8((deltaD * (10 - difficulty)) / 9);
  const nextD = difficulty + damped;
  const w7 = weightAt(params, 7);
  const reverted = roundTo8(w7 * initialDifficultyUnclamped(Rating.Easy, params) + (1 - w7) * nextD);
  return clamp(reverted, 1, 10);
}

/**
 * The reference feeds the *unclamped* D₀(Easy) into mean reversion, so this
 * mirrors that exactly. With default weights D₀(4) is ~1.98, comfortably inside
 * [1, 10], but replicating the reference's clamping placement keeps the
 * cross-validation honest for retuned weight sets where it would not be.
 */
function initialDifficultyUnclamped(rating: Rating, params: SchedulerParams): number {
  return roundTo8(weightAt(params, 4) - Math.exp((rating - 1) * weightAt(params, 5)) + 1);
}

/** S′ᵣ — stability after a successful recall (Hard, Good, or Easy). */
export function nextRecallStability(
  difficulty: number,
  stability: number,
  retrievability: number,
  rating: Rating,
  params: SchedulerParams,
): number {
  const hardPenalty = rating === Rating.Hard ? weightAt(params, 15) : 1;
  const easyBonus = rating === Rating.Easy ? weightAt(params, 16) : 1;
  const growth =
    Math.exp(weightAt(params, 8)) *
    (11 - difficulty) *
    Math.pow(stability, -weightAt(params, 9)) *
    (Math.exp((1 - retrievability) * weightAt(params, 10)) - 1) *
    hardPenalty *
    easyBonus;
  return roundTo8(clamp(stability * (1 + growth), S_MIN, S_MAX));
}

/** S′_f — stability after a lapse (rated Again). */
export function nextForgetStability(
  difficulty: number,
  stability: number,
  retrievability: number,
  params: SchedulerParams,
): number {
  const value =
    weightAt(params, 11) *
    Math.pow(difficulty, -weightAt(params, 12)) *
    (Math.pow(stability + 1, weightAt(params, 13)) - 1) *
    Math.exp((1 - retrievability) * weightAt(params, 14));
  return roundTo8(clamp(value, S_MIN, S_MAX));
}

/** S′ₛ — stability for a same-day re-review. */
export function nextShortTermStability(
  stability: number,
  rating: Rating,
  params: SchedulerParams,
): number {
  const sinc =
    Math.pow(stability, -weightAt(params, 19)) *
    Math.exp(weightAt(params, 17) * (rating - 3 + weightAt(params, 18)));
  // Hard/Good/Easy must never *reduce* stability on a same-day review; Again may.
  const masked = rating >= Rating.Hard ? Math.max(sinc, 1) : sinc;
  return roundTo8(clamp(stability * masked, S_MIN, S_MAX));
}

/**
 * Advance the memory state by one review.
 *
 * `elapsed` is whole days since the previous review; pass 0 for a same-day
 * re-review. `previous` is null for a card being seen for the first time.
 */
export function nextMemoryState(
  previous: MemoryState | null,
  rating: Rating,
  elapsed: number,
  params: SchedulerParams = DEFAULT_PARAMS,
): MemoryState {
  if (elapsed < 0) throw new RangeError(`elapsed must be >= 0, received ${elapsed}`);

  if (previous === null) {
    return {
      stability: initialStability(rating, params),
      difficulty: initialDifficulty(rating, params),
    };
  }

  const { stability, difficulty } = previous;
  const r = retrievabilityAt(stability, elapsed, params);

  let nextStability: number;
  if (elapsed === 0) {
    nextStability = nextShortTermStability(stability, rating, params);
  } else if (rating === Rating.Again) {
    const afterFail = nextForgetStability(difficulty, stability, r, params);
    // A lapse cannot leave stability higher than this ceiling, and cannot
    // exceed what the forget equation produced.
    const ceiling = stability / Math.exp(weightAt(params, 17) * weightAt(params, 18));
    nextStability = clamp(roundTo8(ceiling), S_MIN, afterFail);
  } else {
    nextStability = nextRecallStability(difficulty, stability, r, rating, params);
  }

  return {
    stability: nextStability,
    difficulty: nextDifficulty(difficulty, rating, params),
  };
}

/**
 * Days until this card should next be shown, for the configured retention target.
 *
 *   I(r, S) = (S / factor) · (r^(1/decay) − 1)
 */
export function intervalDays(stability: number, params: SchedulerParams = DEFAULT_PARAMS): number {
  const { decay, factor } = decayFactor(params);
  const modifier = roundTo8((Math.pow(params.requestRetention, 1 / decay) - 1) / factor);
  return Math.min(Math.max(1, Math.round(stability * modifier)), params.maximumInterval);
}

// ---------------------------------------------------------------------------
// Application-facing API
// ---------------------------------------------------------------------------

/**
 * Apply a rating to a card and return its new state.
 *
 * Pass `null` for a word being reviewed for the first time. `now` is injected
 * rather than read from the clock so this stays a pure function — which is what
 * lets the tests below drive multi-year review histories in microseconds.
 */
export function review(
  card: CardState | null,
  rating: Rating,
  now: Date,
  params: SchedulerParams = DEFAULT_PARAMS,
): CardState {
  const elapsed = card === null ? 0 : elapsedDays(new Date(card.lastReviewedAt), now);
  const memory = nextMemoryState(card, rating, elapsed, params);
  const scheduledDays = intervalDays(memory.stability, params);
  const due = new Date(now.getTime() + scheduledDays * MS_PER_DAY);

  const isLapse = card !== null && rating === Rating.Again;

  return {
    stability: memory.stability,
    difficulty: memory.difficulty,
    due: due.toISOString(),
    lastReviewedAt: now.toISOString(),
    reps: (card?.reps ?? 0) + 1,
    lapses: (card?.lapses ?? 0) + (isLapse ? 1 : 0),
    scheduledDays,
  };
}

/** Current probability the learner recalls this card. */
export function currentRetrievability(
  card: CardState,
  now: Date,
  params: SchedulerParams = DEFAULT_PARAMS,
): number {
  return retrievabilityAt(card.stability, elapsedDays(new Date(card.lastReviewedAt), now), params);
}

/** Whether this card has reached its scheduled review time. */
export function isDue(card: CardState, now: Date): boolean {
  return new Date(card.due).getTime() <= now.getTime();
}

/**
 * Order cards for a review session: most overdue first.
 *
 * This is what the original code was missing entirely. Ranking by
 * retrievability rather than by due date means the card the learner is closest
 * to forgetting comes first, which is the whole point of the algorithm.
 */
export function sortByUrgency<T extends { readonly card: CardState }>(
  entries: readonly T[],
  now: Date,
  params: SchedulerParams = DEFAULT_PARAMS,
): T[] {
  return entries
    .map((entry) => ({ entry, r: currentRetrievability(entry.card, now, params) }))
    .sort((a, b) => a.r - b.r)
    .map(({ entry }) => entry);
}
