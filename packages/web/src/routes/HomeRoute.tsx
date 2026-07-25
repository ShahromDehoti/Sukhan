import { unitCompletion } from "@sukhan/core";
import { Link } from "react-router";
import { QueryState } from "../components/QueryState.js";
import { useCurriculum } from "../hooks/useCurriculum.js";
import { useProgress } from "../hooks/useStoredState.js";

export function HomeRoute(): React.JSX.Element {
  const curriculum = useCurriculum();
  const progress = useProgress();

  return (
    <QueryState
      isPending={curriculum.isPending}
      error={curriculum.error}
      onRetry={() => void curriculum.refetch()}
    >
      <section aria-labelledby="learn-heading">
        <h2 id="learn-heading" className="section-heading">
          Learn
        </h2>

        {curriculum.data?.length === 0 && <p>No units are available yet.</p>}

        <ul className="unit-list">
          {curriculum.data?.map((unit) => {
            const completion = unitCompletion(unit, progress);
            const percent = Math.round(completion.ratio * 100);

            return (
              <li key={unit.id}>
                <Link
                  to={`/unit/${unit.id}`}
                  className={`unit-card${completion.isComplete ? " unit-card--completed" : ""}`}
                >
                  <span className="unit-card-title">
                    {unit.title}
                    {completion.isComplete && (
                      <span className="unit-badge" aria-label="Unit complete">
                        <span aria-hidden="true">✓</span>
                      </span>
                    )}
                  </span>
                  <span className="unit-card-description">{unit.description}</span>
                  <span className="unit-card-count">
                    {completion.completedLessons} of {completion.totalLessons} lessons
                  </span>

                  {/*
                    A styled div cannot convey a value. `role="progressbar"`
                    with its aria-value* attributes is what makes the bar
                    readable as "42 percent" rather than being skipped entirely.
                  */}
                  <span
                    className="progress-bar"
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${unit.title} progress`}
                  >
                    <span className="progress-bar-fill" style={{ width: `${String(percent)}%` }} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="practice-heading" className="practice-section">
        <h2 id="practice-heading" className="section-heading">
          Practice
        </h2>
        <p>Browse the full vocabulary by topic, with no progress tracking.</p>
        <Link to="/practice" className="primary-button">
          Open practice mode
        </Link>
      </section>
    </QueryState>
  );
}
