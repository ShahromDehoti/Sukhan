import { useEffect, useRef, type ReactNode } from "react";

interface DialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
}

/**
 * A modal dialog that behaves like one.
 *
 * The original modals were plain divs: focus stayed behind them on the page,
 * Escape did nothing, Tab wandered out into the content underneath, and nothing
 * announced that a dialog had opened. This implements the four behaviours the
 * WAI-ARIA dialog pattern requires:
 *
 *  1. Focus moves into the dialog on open.
 *  2. Escape closes it.
 *  3. Tab and Shift+Tab cycle within it rather than escaping behind it.
 *  4. Focus returns to whatever opened it on close — otherwise a keyboard user
 *     is dumped back at the top of the document.
 *
 * `aria-modal` plus `role="dialog"` tell assistive technology to treat the rest
 * of the page as inert while it is open.
 */
export function Dialog({ isOpen, onClose, title, children }: DialogProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Prefer the first interactive control; fall back to the panel itself,
    // which is why it carries tabIndex={-1}.
    const firstFocusable = focusableWithin(panel)[0];
    if (firstFocusable !== undefined) firstFocusable.focus();
    else panel?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableWithin(panelRef.current);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;

      // Wrap at both ends so focus never leaves the dialog.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="dialog-overlay"
      // Clicking the backdrop closes, but only the backdrop itself — a click
      // that started inside the panel must not dismiss it.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <h2 className="dialog-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (root === null) return [];
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}
