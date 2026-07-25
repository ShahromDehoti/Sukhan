# Code review case study

Sukhan began as a 1,115-line `App.jsx` plus four utility modules, written quickly
and working well enough to use daily. This document reviews that code the way I
would review a pull request: each finding states the symptom, the analysis, why
it survives ordinary review, the fix, and the test that now catches it.

Every claim here is backed by a measurement or a test in the repository. Where a
number appears, it was produced by code you can run.

---

## 1. The shuffle was not a shuffle

**Where:** `src/utils/srs.js`, in `getMidUnitReviewWords`, `getEndUnitReviewWords`,
`getQuizWords`, and `shuffleTranslations` — every place the codebase shuffled.

```js
words.sort(() => Math.random() - 0.5);
```

**Symptom.** Quiz answers appeared in an order that felt subtly predictable.

**Analysis.** `Array.prototype.sort` requires a comparator that is *consistent*
(the same pair always compares the same way) and *transitive*. This one returns a
fresh random answer every time it is asked, so the algorithm's precondition is
violated and the output distribution is an artifact of whichever sort the engine
happens to use — TimSort, in V8.

I did not want to assert this on authority, so I measured it. Chi-square over the
full position matrix, 200,000 trials per configuration, seeded:

| n | Fisher–Yates | `sort` comparator |
|---|---:|---:|
| 3 | 15.61 | 176,317 |
| 4 | 13.31 | 99,752 |
| 5 | **16.91** | **102,001** |
| 6 | 26.06 | 105,803 |
| 8 | 31.31 | 86,721 |

The critical value at p=0.001 with 16 degrees of freedom is 39.25. Fisher–Yates
sits comfortably under it; the comparator version misses by four orders of
magnitude.

The distribution tells you *why* it matters. At n=5, the quiz size, as a
percentage of uniform:

```
            pos0    pos1    pos2    pos3    pos4
item0       162%     83%     60%     70%    125%
item1        62%    162%    120%    121%     35%
item2        81%     82%    140%     90%    106%
item3       110%    117%     70%    109%     94%
item4        86%     55%    109%    110%    140%
```

Look at the diagonal. Items stay near where they started far more often than
chance — item0 holds position 0 **62% more often than it should**. In a
two-column matching quiz that means the correct translation sits on the same row
as its prompt far more often than it ought to, and a learner can score well by
reading the layout instead of knowing the vocabulary. The bug does not just skew
a distribution; it quietly undermines the assessment.

**Why it survives review.** It reads as obviously correct, it is widely
copy-pasted, and the output *looks* shuffled. Nothing short of measurement
distinguishes it from a real shuffle.

**Fix.** `packages/core/src/random.ts` — Fisher–Yates over an injected seeded
generator.

**Test.** `random.test.ts` computes the statistic for both implementations and
asserts the correct one falls below the critical value while the naive one
exceeds it by 10×. The buggy version is kept in the test file, never in shipped
code, so the test measures the claim instead of restating it.

---

## 2. The spaced-repetition system did not schedule anything

**Where:** `src/utils/srs.js`.

**Symptom.** None visible. The app looked like it was working.

**Analysis.** `rateWord` diligently computed a `nextReview` date on every rating
and wrote it to `localStorage`. Nothing ever read it. Review selection
(`getMidUnitReviewWords`) sorted by the *most recent rating* instead:

```js
const hardWords = getHardWords();   // last rated 'again' or 'hard'
```

So a word rated `hard` a year ago and one rated `hard` this morning were
indistinguishable, and the interval arithmetic — the entire point of an SRS — had
no effect on what the learner saw. The feature was decorative.

**Why it survives review.** The code that computes the schedule is correct and
well-commented. The defect is an *absence*: a read that never happens. Reviewing
a diff shows you the write; only tracing the data end to end shows you that
nothing consumes it. Grepping for the field name is what surfaced it.

**Fix.** `packages/core/src/scheduler.ts` implements FSRS-6, and
`session.ts:selectReviewWords` orders candidates by current retrievability, so
the learner sees whatever they are closest to forgetting.

**Tests.** Two layers, because they catch different things:

- `scheduler.test.ts` cross-validates every equation against `ts-fsrs`, the
  reference implementation, over parameter grids *and* 20,000 randomised
  multi-review histories. Hand-copied expected values would only have been as
  trustworthy as my transcription; a second implementation is not.
- `scheduler.property.test.ts` asserts the invariants the application depends on
  over thousands of generated inputs — difficulty stays in [1,10], a better
  rating never yields a shorter interval, `Again` never increases stability.

I verified the cross-validation can actually fail by mutating one coefficient
from `(11 - difficulty)` to `(11.0001 - difficulty)`. Two tests failed; reverting
restored 28/28. A test suite that cannot fail is not evidence of anything.

---

## 3. Property testing found a boundary I had asserted wrongly

Worth recording because the failure was *mine*, and it changed the code.

I wrote a property claiming retrievability at the due date always exceeds 0.7.
fast-check refuted it in 43 cases and shrank the counterexample to
`[Again, Again, Again]`, landing at 0.636.

The implementation was right and my claim was wrong. Three lapses drive stability
below one day, but `intervalDays` floors at `max(1, …)` — a day-granularity
scheduler cannot show a card in four hours. The card returns later than ideal and
decays further in the meantime.

The fix was to state the real contract as two properties: the target is met
whenever the day-floor is not binding, and the floor is the *only* thing that can
push retrievability below target. A vague property became a precise, tested
specification of a real boundary.

---

## 4. Success was reported for work that had not happened

**Where:** `src/App.jsx:1041`.

```js
fetch(GOOGLE_FORM_URL, { method: "POST", mode: "no-cors", body });
setShowToast(true);   // never awaited, never checked
```

**Analysis.** Two independent defects. The promise is never awaited, so the toast
fires before the request has gone anywhere. And `mode: "no-cors"` produces an
*opaque* response whose status is unreadable by construction — so even awaiting
it would tell you nothing about whether the submission succeeded. A learner
offline saw "Feedback sent!" for feedback that was silently discarded.

**Why it survives review.** It works perfectly on a good connection, which is
where it is always tested.

**Fix.** `components/FeedbackDialog.tsx` awaits the request and reports failure
when the fetch itself rejects. `no-cors` is genuinely required — Google Forms
sends no CORS headers — so the honest resolution is to catch what *is*
detectable and word the success message so it does not claim more than is known.

**Test coverage note.** This one is covered by the component's error path, not by
a network assertion; an opaque response cannot be asserted on.

---

## 5. A conditional that did nothing, guarding a rule nobody called

**Where:** `src/utils/progress.js:107-126`.

```js
if (previousLessonNumber >= 2 && previousLessonNumber % 2 === 0) {
  const reviewId = `review-${unitId}-${previousLessonNumber}`;
  if (!isReviewComplete(reviewId)) {
    return previousLessonComplete;   // ← same value as the fall-through
  }
}
return previousLessonComplete;
```

Both paths return the same expression, so the entire block is a no-op. And
`isLessonUnlocked` was exported but never imported: `App.jsx` computed unlocking
inline instead. Two implementations of one rule, one of them dead and subtly
broken. `isQuizUnlocked` separately accepted a `lessons` parameter it never used.

**Why it survives review.** Dead code is invisible in a diff — nothing changes,
so nothing draws attention. A linter flags unused *variables*, not unused
*exports*.

**Fix.** `packages/core/src/curriculum.ts` has one rule,
`isCheckpointUnlocked`, and the UI calls it.

**A design change fell out of the test.** My first version checked only the
*immediately* preceding checkpoint. Writing the test made me ask what happens on
gapped progress — every lesson complete but a mid-unit review missing. That is
unreachable through the UI, but it is exactly what merging two devices' records
produces, and progress sync is on the roadmap. The weaker rule would hand out the
final review and quiz for free. The rule now requires *all* preceding checkpoints,
which is equivalent for normal play and safe under merges.

---

## 6. Quiz scoring compared the wrong things

**Where:** `src/App.jsx:277-295`.

```js
if (quizTranslations[matchedTransIdx] === word.english) score++;
```

Scoring by string equality on the translation. Two words sharing an English gloss
— entirely plausible in a bilingual dictionary — would score a wrong answer as
correct. `scoreQuiz` in `packages/core/src/session.ts` compares indices against an
explicit answer key built from word IDs.

---

## 7. Smaller findings

| Finding | Location | Fix |
|---|---|---|
| Both fetches awaited sequentially though independent | `App.jsx:52-67` | Two React Query queries, fetched concurrently |
| Failures logged to console, rendered as an empty screen | `utils/supabase.js` | Throw; `QueryState` renders an error with retry |
| `.order("sort_order")` ordered outer rows, not words within a lesson | `utils/supabase.js:69` | Per-level ordering, re-asserted client-side |
| Three queries + client-side stitching, fetching all `lesson_words` unfiltered | `utils/supabase.js:38-105` | One nested PostgREST query |
| Deck navigation wrapped modulo, so the last card looped silently | `App.jsx:134-146` | Clamped; "Complete lesson" replaces "Next" at the end |
| Empty unit produced a final review over zero lessons and a quiz over no words | `utils/progress.js:204` | Guarded on lesson count |
| Derangement by retrying a biased shuffle up to 50×, then giving up | `utils/srs.js` | Sattolo's algorithm — O(n), no retry, no fixed points |
| Credentials hard-coded in source and in the committed bundle | `utils/supabase.js:3-5` | Environment variables; **the key still needs rotating** |
| `setProgressTick` counter to force re-renders after storage writes | `App.jsx:114` | `useSyncExternalStore` over a store that publishes changes |

---

## 8. One found by doing, not by reading

Migrating the build, I set `manualChunks` and `sourcemap` in a new
`vite.config.ts`. The build succeeded and both settings were silently ignored.

The original `vite.config.js` was still present, and Vite resolves `.js` before
`.ts` — so the old three-line config shadowed the new one. No error, no warning;
the build simply did something other than what the config said.

Worth including because it is the class of bug that review cannot catch at all.
It is invisible in a diff — both files are individually correct — and only shows
up when you check that the output matches the intent. I noticed because the
bundle was one 562 kB chunk when I had asked for three, and no `.map` files were
emitted. Verifying that a change *took effect* is a separate step from verifying
that it is *correct*.

---

## What generalises

- **Absent reads are invisible.** A written-but-never-read field looks like a
  working feature. Trace data end to end, not just the diff.
- **Measure the claim.** "This shuffle is biased" is an assertion; a chi-square
  statistic is evidence, and the position matrix is what turned a statistical
  curiosity into a pedagogical bug.
- **Mutate the test.** A suite that cannot fail proves nothing. One perturbed
  coefficient is a cheap check that the harness has teeth.
- **A failing property is information.** When fast-check refuted my claim, the
  right response was a more precise specification, not a looser assertion.
- **Confirm the change took effect.** Correct configuration that never loads is
  indistinguishable from no configuration.
