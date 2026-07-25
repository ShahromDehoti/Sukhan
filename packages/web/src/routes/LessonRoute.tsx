import { buildCheckpoints, completeCheckpoint, type LessonCheckpoint } from "@sukhan/core";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Flashcard } from "../components/Flashcard.js";
import { QueryState } from "../components/QueryState.js";
import { findUnit, useCurriculum } from "../hooks/useCurriculum.js";
import { saveProgress, useProgress, useSettings } from "../hooks/useStoredState.js";
import { NotFoundRoute } from "./NotFoundRoute.js";

export function LessonRoute(): React.JSX.Element {
  const { unitId, lessonId } = useParams();
  const curriculum = useCurriculum();
  const progress = useProgress();
  const [settings] = useSettings();
  const navigate = useNavigate();

  const [index, setIndex] = useState(0);
  const [isFlipped, setFlipped] = useState(false);

  const unit = findUnit(curriculum.data, unitId);
  const checkpoint = unit
    ? buildCheckpoints(unit).find(
        (entry): entry is LessonCheckpoint => entry.type === "lesson" && entry.id === lessonId,
      )
    : undefined;

  const words = checkpoint?.words ?? [];
  const word = words[index];
  const isLast = index === words.length - 1;

  function step(delta: number): void {
    setFlipped(false);
    // Clamped, not wrapped. The original used modulo arithmetic, so "Next" on
    // the final card silently looped back to the first one and the deck had no
    // end — the learner had no way to tell they had finished.
    setIndex((current) => Math.min(Math.max(current + delta, 0), words.length - 1));
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
      ) : words.length === 0 || word === undefined ? (
        <>
          <Link to={`/unit/${unit.id}`} className="back-link">
            ← Back to unit
          </Link>
          <p>This lesson has no words yet.</p>
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
          />

          <nav className="deck-controls" aria-label="Card navigation">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                step(-1);
              }}
              disabled={index === 0}
            >
              Previous
            </button>

            {/* A live region so the position is announced as the deck advances. */}
            <p className="deck-position" role="status" aria-live="polite">
              Card {index + 1} of {words.length}
            </p>

            {isLast ? (
              <button type="button" className="primary-button" onClick={finish}>
                Complete lesson
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  step(1);
                }}
              >
                Next
              </button>
            )}
          </nav>
        </>
      )}
    </QueryState>
  );
}
