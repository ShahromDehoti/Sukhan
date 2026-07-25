import { useState } from "react";
import { Link, Outlet } from "react-router";
import { FeedbackDialog } from "./FeedbackDialog.js";
import { SettingsDialog } from "./SettingsDialog.js";

/**
 * The application shell.
 *
 * The original repeated this markup — wrapper, card, footer — inside all six
 * view branches, so a change to the chrome meant six edits. It lives once, here.
 *
 * The skip link and the `<main>` landmark give keyboard and screen-reader users
 * a way past the header on every page, which is a WCAG 2.4.1 requirement the
 * original did not meet.
 */
export function Layout(): React.JSX.Element {
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isFeedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <div className="app-root">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <div className="app-wrapper">
        <header className="app-header">
          <Link to="/" className="app-title-link">
            <h1 className="app-title">Sukhan</h1>
          </Link>
          <div className="app-header-actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Settings"
              aria-haspopup="dialog"
              onClick={() => {
                setSettingsOpen(true);
              }}
            >
              <span aria-hidden="true">⚙️</span>
            </button>
            <button
              type="button"
              className="text-button"
              aria-haspopup="dialog"
              onClick={() => {
                setFeedbackOpen(true);
              }}
            >
              Feedback
            </button>
          </div>
        </header>

        <main id="main" className="app-card" tabIndex={-1}>
          <Outlet />
        </main>

        <footer className="global-footer">
          © {new Date().getFullYear()} Shahrom Dehoti
        </footer>
      </div>

      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => {
          setSettingsOpen(false);
        }}
      />
      <FeedbackDialog
        isOpen={isFeedbackOpen}
        onClose={() => {
          setFeedbackOpen(false);
        }}
      />
    </div>
  );
}
