import { buildCheckpoints, isCheckpointComplete, isCheckpointUnlocked } from "@sukhan/core";
import { Link, useParams } from "react-router";
import { QueryState } from "../components/QueryState.js";
import { findUnit, useCurriculum } from "../hooks/useCurriculum.js";
import { useProgress } from "../hooks/useStoredState.js";
import { NotFoundRoute } from "./NotFoundRoute.js";

const ICONS = { lesson: "📖", review: "🔄", quiz: "🎯" } as const;

export function UnitRoute(): React.JSX.Element {
  const { unitId } = useParams();
  const curriculum = useCurriculum();
  const progress = useProgress();

  const unit = findUnit(curriculum.data, unitId);

  return (
    <QueryState
      isPending={curriculum.isPending}
      error={curriculum.error}
      onRetry={() => void curriculum.refetch()}
    >
      {unit === undefined ? (
        <NotFoundRoute />
      ) : (
        <>
          <Link to="/" className="back-link">
            ← All units
          </Link>
          <h2 className="section-heading">{unit.title}</h2>
          <p className="unit-description">{unit.description}</p>

          <ol className="checkpoint-list">
            {buildCheckpoints(unit).map((checkpoint, index, checkpoints) => {
              const complete = isCheckpointComplete(checkpoint, progress);
              const unlocked = isCheckpointUnlocked(checkpoints, index, progress);

              const href =
                checkpoint.type === "lesson"
                  ? `/unit/${unit.id}/lesson/${checkpoint.id}`
                  : checkpoint.type === "review"
                    ? `/unit/${unit.id}/review/${checkpoint.id}`
                    : `/unit/${unit.id}/quiz`;

              const className = [
                "checkpoint-card",
                `checkpoint-card--${checkpoint.type}`,
                complete ? "checkpoint-card--complete" : "",
                unlocked ? "" : "checkpoint-card--locked",
              ]
                .filter(Boolean)
                .join(" ");

              const status = complete ? "Completed" : unlocked ? "Available" : "Locked";

              return (
                <li key={checkpoint.id}>
                  {unlocked ? (
                    <Link to={href} className={className}>
                      <CheckpointBody checkpoint={checkpoint} status={status} />
                    </Link>
                  ) : (
                    /*
                      A locked checkpoint is rendered as a disabled button
                      rather than a styled link. A link that goes nowhere is
                      still announced and still focusable, which invites a
                      keyboard user to activate something that does nothing;
                      `disabled` communicates unavailability directly.
                    */
                    <button type="button" className={className} disabled>
                      <CheckpointBody checkpoint={checkpoint} status={status} />
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </QueryState>
  );
}

function CheckpointBody({
  checkpoint,
  status,
}: {
  readonly checkpoint: { type: keyof typeof ICONS; title: string; description: string };
  readonly status: string;
}): React.JSX.Element {
  return (
    <>
      <span className="checkpoint-icon" aria-hidden="true">
        {ICONS[checkpoint.type]}
      </span>
      <span className="checkpoint-text">
        <span className="checkpoint-title">{checkpoint.title}</span>
        <span className="checkpoint-description">{checkpoint.description}</span>
      </span>
      {/* Status is text, not a colour or an emoji, so it survives being read aloud. */}
      <span className="checkpoint-status">{status}</span>
    </>
  );
}
