import {
  buildCheckpoints,
  buildQuiz,
  completeCheckpoint,
  createRng,
  scoreQuiz,
  wordsInUnit,
  type QuizCheckpoint,
} from "@sukhan/core";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { QueryState } from "../components/QueryState.js";
import { findUnit, useCurriculum } from "../hooks/useCurriculum.js";
import { saveProgress, useProgress } from "../hooks/useStoredState.js";
import { NotFoundRoute } from "./NotFoundRoute.js";

const QUIZ_SIZE = 5;

export function QuizRoute(): React.JSX.Element {
  const { unitId } = useParams();
  const curriculum = useCurriculum();
  const progress = useProgress();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState(0);
  const [matches, setMatches] = useState<ReadonlyMap<number, number>>(new Map());
  const [selectedPrompt, setSelectedPrompt] = useState<number | null>(null);
  const [isSubmitted, setSubmitted] = useState(false);

  const unit = findUnit(curriculum.data, unitId);
  const checkpoint = unit
    ? buildCheckpoints(unit).find((entry): entry is QuizCheckpoint => entry.type === "quiz")
    : undefined;

  // `attempt` is part of the seed so "Try again" genuinely reshuffles.
  const quiz = useMemo(() => {
    if (unit === undefined) return undefined;
    return buildQuiz(wordsInUnit(unit), { count: QUIZ_SIZE, rng: createRng(attempt + 1) });
  }, [unit, attempt]);

  const result = quiz ? scoreQuiz(quiz, matches) : undefined;

  function choose(choiceIndex: number): void {
    if (isSubmitted || selectedPrompt === null) return;
    const next = new Map(matches);
    // A choice can only be used once: assigning it elsewhere releases it from
    // whichever prompt held it.
    for (const [prompt, choice] of next) {
      if (choice === choiceIndex) next.delete(prompt);
    }
    next.set(selectedPrompt, choiceIndex);
    setMatches(next);
    setSelectedPrompt(null);
  }

  function submit(): void {
    if (quiz === undefined || checkpoint === undefined || unit === undefined) return;
    setSubmitted(true);
    // Only a flawless attempt completes the checkpoint, matching the original.
    if (scoreQuiz(quiz, matches).isPerfect) {
      saveProgress(completeCheckpoint(progress, checkpoint));
    }
  }

  function retry(): void {
    setAttempt((n) => n + 1);
    setMatches(new Map());
    setSelectedPrompt(null);
    setSubmitted(false);
  }

  return (
    <QueryState
      isPending={curriculum.isPending}
      error={curriculum.error}
      onRetry={() => void curriculum.refetch()}
    >
      {unit === undefined || checkpoint === undefined || quiz === undefined ? (
        <NotFoundRoute />
      ) : (
        <>
          <Link to={`/unit/${unit.id}`} className="back-link">
            ← Back to unit
          </Link>
          <h2 className="section-heading">{checkpoint.title}</h2>
          <p className="quiz-instructions">
            Select a Tajik word, then its English translation.
          </p>

          <div className="quiz-columns">
            <fieldset className="quiz-column">
              <legend className="quiz-legend">Tajik</legend>
              {quiz.prompts.map((word, promptIndex) => {
                const matched = matches.get(promptIndex);
                const correct = result?.correctness[promptIndex];
                return (
                  <button
                    key={word.id}
                    type="button"
                    lang="tg"
                    className={quizItemClass("prompt", {
                      selected: selectedPrompt === promptIndex,
                      matched: matched !== undefined,
                      submitted: isSubmitted,
                      correct,
                    })}
                    // Communicates selection state rather than relying on colour.
                    aria-pressed={selectedPrompt === promptIndex}
                    disabled={isSubmitted}
                    onClick={() => {
                      setSelectedPrompt(promptIndex);
                    }}
                  >
                    {word.tajik}
                    {matched !== undefined && (
                      <span className="quiz-badge">{matched + 1}</span>
                    )}
                  </button>
                );
              })}
            </fieldset>

            <fieldset className="quiz-column">
              <legend className="quiz-legend">English</legend>
              {quiz.choices.map((word, choiceIndex) => {
                const takenBy = [...matches].find(([, choice]) => choice === choiceIndex);
                return (
                  <button
                    key={word.id}
                    type="button"
                    lang="en"
                    className={quizItemClass("choice", {
                      matched: takenBy !== undefined,
                      submitted: isSubmitted,
                    })}
                    disabled={isSubmitted || selectedPrompt === null}
                    onClick={() => {
                      choose(choiceIndex);
                    }}
                  >
                    <span className="quiz-index" aria-hidden="true">
                      {choiceIndex + 1}
                    </span>
                    {word.english}
                  </button>
                );
              })}
            </fieldset>
          </div>

          {!isSubmitted ? (
            <button
              type="button"
              className="primary-button"
              disabled={matches.size < quiz.prompts.length}
              onClick={submit}
            >
              Submit
            </button>
          ) : (
            <div className="quiz-result" role="status">
              <p className="quiz-score">
                {result?.correct} of {result?.total} correct
              </p>
              {result?.isPerfect === true ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void navigate(`/unit/${unit.id}`)}
                >
                  Back to unit
                </button>
              ) : (
                <>
                  <p>A perfect score is needed to complete the unit.</p>
                  <button type="button" className="primary-button" onClick={retry}>
                    Try again
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </QueryState>
  );
}

function quizItemClass(
  kind: "prompt" | "choice",
  state: {
    selected?: boolean;
    matched?: boolean;
    submitted?: boolean;
    correct?: boolean | undefined;
  },
): string {
  return [
    "quiz-item",
    `quiz-item--${kind}`,
    state.selected === true ? "quiz-item--selected" : "",
    state.matched === true ? "quiz-item--matched" : "",
    state.submitted === true && state.correct === true ? "quiz-item--correct" : "",
    state.submitted === true && state.correct === false ? "quiz-item--wrong" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
