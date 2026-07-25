import { Link, isRouteErrorResponse, useRouteError } from "react-router";

/**
 * Router-level error boundary.
 *
 * The original had no error path at all: a failed fetch was logged to the
 * console and the learner was shown an empty screen with no message and no way
 * to retry. Anything that throws during rendering or loading now surfaces here
 * with a way out.
 */
export function RouteError(): React.JSX.Element {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${String(error.status)} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred.";

  return (
    <div className="app-root">
      <div className="app-wrapper">
        <main className="app-card" role="alert">
          <h1 className="app-title">Something went wrong</h1>
          <p className="error-message">{message}</p>
          <div className="error-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                globalThis.location.reload();
              }}
            >
              Reload
            </button>
            <Link className="back-link" to="/">
              Back to home
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
