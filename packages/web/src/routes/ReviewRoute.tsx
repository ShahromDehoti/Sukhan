import {
  ALL_RATINGS,
  Rating,
  buildCheckpoints,
  completeCheckpoint,
  createRng,
  review as applyRating,
  reviewSessionSize,
  selectReviewWords,
  wordsForReview,
  type ReviewCheckpoint,
  type Word,
} from "@sukhan/core";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Flashcard } from "../components/Flashcard.js";
import { QueryState } from "../components/QueryState.js";
import { findUnit, useCurriculum } from "../hooks/useCurriculum.js";
import { saveCard, useCards, useProgress, useSettings } from "../hooks/useStoredState.js";
import { saveProgress } from "../lib/storage.js";
import { NotFoundRoute } from "./NotFoundRoute.js";

const RATING_LABELS: Record<Rating, string> = {
  [Rating.Again]: "Again",
  [Rating.Hard]: "Hard",
  [Rating.Good]: "Good",
  [Rating.Easy]: "Easy",
};

export function ReviewRoute(): React.JSX.Element {
  const { unitId, checkpointId } = useParams();
  const curriculum = useCurriculum();
  const progress = useProgress();
  const cards = useCards();
  const [settings] = useSettings();
  const navigate = useNavigate();

  const [index, setIndex] = useState(0);
  const [isFlipped, setFlipped] = useState(false);
  const [hasRated, setHasRated] = useState(false);

  const unit = findUnit(curriculum.data, unitId);
  const checkpoint = unit
    ? buildCheckpoints(unit).find(
        (entry): entry is ReviewCheckpoint => entry.type === "review" && entry.id === checkpointId,
      )
    : undefined;

  /**
   * Which words this session covers.
   *
   * Selection is driven by the scheduler: the learner sees whatever they are
   * closest to forgetting. The original sorted by the most recent rating and
   * ignored time entirely, so a word marked "hard" a year ago ranked exactly
   * alongside one marked "hard" this morning.
   *
   * The RNG is seeded from the checkpoint id so that re-entering the same
   * review gives the same deck rather than reshuffling under the learner.
   */
  const sessionWords = useMemo<Word[]>(() => {
    if (unit === undefined || checkpoint === undefined) return [];
    const candidates = wordsForReview(unit, checkpoint).map((word) => ({
      word,
      card: cards.get(word.id) ?? null,
    }));
    return selectReviewWords(candidates, {
      now: new Date(),
      limit: reviewSessionSize(candidates.length),
      rng: createRng(hashString(checkpoint.id)),
    });
  }, [unit, checkpoint, cards]);

  const word = sessionWords[index];
  const isLast = index === sessionWords.length - 1;

  function rate(rating: Rating): void {
    if (word === undefined) return;
    saveCard(word.id, applyRating(cards.get(word.id) ?? null, rating, new Date()));
    setHasRated(true);
  }

  function advance(): void {
    setFlipped(false);
    setHasRated(false);
    setIndex((current) => current + 1);
  }

  function finish(): void {
    if (checkpoint === undefined || unit === undefined) return;
    saveProgress(completeCheckpoint(progress, checkpoint));
    void navigate(`/unit/${unit.id}`);
  }

  return (
    <QueryState
      isPending={curriculum.isPending}
      error={curriculum.error}
      onRetry={() => void curriculum.refetch()}
    >
      {unit === undefined || checkpoint === undefined ? (
        <NotFoundRoute />
      ) : sessionWords.length === 0 || word === undefined ? (
        <>
          <Link to={`/unit/${unit.id}`} className="back-link">
            ← Back to unit
          </Link>
          <p>Nothing to review here yet.</p>
          <button type="button" className="primary-button" onClick={finish}>
            Mark as done
          </button>
        </>
      ) : (
        <>
          <Link to={`/unit/${unit.id}`} className="back-link">
            ← Back to unit
          </Link>
          <h2 className="section-heading">{checkpoint.title}</h2>

          <Flashcard
            word={word}
            isFlipped={isFlipped}
            onFlip={() => {
              setFlipped((flipped) => !flipped);
            }}
            pronunciation={settings.pronunciation}
            backHint="Rate how well you recalled it"
          />

          <p className="deck-position" role="status" aria-live="polite">
            Card {index + 1} of {sessionWords.length}
          </p>

          {isFlipped && !hasRated && (
            <fieldset className="rating-group">
              <legend className="rating-legend">How well did you recall it?</legend>
              {ALL_RATINGS.map((rating) => (
                <button
                  key={rating}
                  type="button"
                  className={`rating-button rating-button--${RATING_LABELS[rating].toLowerCase()}`}
                  onClick={() => {
                    rate(rating);
                  }}
                >
                  {RATING_LABELS[rating]}
                </button>
              ))}
            </fieldset>
          )}

          {hasRated && (
            <div className="rating-confirmation">
              <p role="status">Saved.</p>
              {isLast ? (
                <button type="button" className="primary-button" onClick={finish}>
                  Finish review
                </button>
              ) : (
                <button type="button" className="primary-button" onClick={advance}>
                  Next card
                </button>
              )}
            </div>
          )}

          {!isFlipped && <p className="deck-hint">Reveal the card to rate it.</p>}
        </>
      )}
    </QueryState>
  );
}

/** Stable 32-bit hash, so a given checkpoint always seeds the same deck. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
