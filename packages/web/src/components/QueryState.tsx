import type { ReactNode } from "react";

interface QueryStateProps {
  readonly isPending: boolean;
  readonly error: Error | null;
  readonly onRetry: () => void;
  readonly children: ReactNode;
}

/**
 * Loading and error presentation for a query-backed screen.
 *
 * The original had neither: `fetchCurriculum` swallowed errors into
 * `console.error`, returned `null`, and the UI rendered an empty grid. A
 * learner with a flaky connection saw a course with no units in it and no
 * indication anything had gone wrong.
 */
export function QueryState({
  isPending,
  error,
  onRetry,
  children,
}: QueryStateProps): React.JSX.Element {
  if (isPending) {
    return (
      <p className="loading-state" role="status">
        Loading…
      </p>
    );
  }

  if (error !== null) {
    return (
      <div className="error-state" role="alert">
        <p>We couldn&rsquo;t load your lessons.</p>
        <p className="error-detail">{error.message}</p>
        <button type="button" className="primary-button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
