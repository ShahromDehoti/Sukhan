import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Flashcard } from "../components/Flashcard.js";
import { QueryState } from "../components/QueryState.js";
import { useWordsByCategory } from "../hooks/useCurriculum.js";
import { useSettings } from "../hooks/useStoredState.js";
import { CATEGORY_LABELS } from "../lib/api.js";

const DEFAULT_CATEGORY = "greetings";

export function PracticeRoute(): React.JSX.Element {
  const words = useWordsByCategory();
  const [settings] = useSettings();
  // Category lives in the URL, so a particular topic is linkable and survives
  // a refresh — neither of which was possible when it was component state.
  const [searchParams, setSearchParams] = useSearchParams();
  const [index, setIndex] = useState(0);
  const [isFlipped, setFlipped] = useState(false);

  const category = searchParams.get("category") ?? DEFAULT_CATEGORY;
  const categories = Object.keys(words.data ?? {}).sort();
  const wordsInCategory = words.data?.[category] ?? [];
  const word = wordsInCategory[index];

  function selectCategory(next: string): void {
    setSearchParams({ category: next }, { replace: true });
    setIndex(0);
    setFlipped(false);
  }

  function step(delta: number): void {
    setFlipped(false);
    setIndex((current) => Math.min(Math.max(current + delta, 0), wordsInCategory.length - 1));
  }

  return (
    <QueryState
      isPending={words.isPending}
      error={words.error}
      onRetry={() => void words.refetch()}
    >
      <Link to="/" className="back-link">
        ← Home
      </Link>
      <h2 className="section-heading">Practice</h2>

      {/*
        One control, styled two ways. The original rendered a row of buttons and
        a separate <select>, showing one or the other by breakpoint — which put
        two competing controls for the same state in the accessibility tree at
        once. A single labelled select is unambiguous at every width.
      */}
      <label className="category-label" htmlFor="practice-category">
        Topic
      </label>
      <select
        id="practice-category"
        className="category-select"
        value={category}
        onChange={(event) => {
          selectCategory(event.target.value);
        }}
      >
        {categories.map((key) => (
          <option key={key} value={key}>
            {CATEGORY_LABELS[key] ?? key}
          </option>
        ))}
      </select>

      {word === undefined ? (
        <p>No words in this topic yet.</p>
      ) : (
        <>
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
            <p className="deck-position" role="status" aria-live="polite">
              Card {index + 1} of {wordsInCategory.length}
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                step(1);
              }}
              disabled={index >= wordsInCategory.length - 1}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </QueryState>
  );
}
