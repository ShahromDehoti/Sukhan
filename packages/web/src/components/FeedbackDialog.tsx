import { useId, useState } from "react";
import { Dialog } from "./Dialog.js";

const GOOGLE_FORM_ACTION =
  "https://docs.google.com/forms/d/e/1FAIpQLSfWJt8ElHb8IKtoDTLpHllvTAiy_UA27cJlRwLJzdFGYMqDgw/formResponse";
const GOOGLE_FORM_FIELD = "entry.358480867";

type Status = "idle" | "sending" | "sent" | "failed";

interface FeedbackDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

/**
 * Feedback capture.
 *
 * ## The bug this fixes
 *
 * The original fired the request and reported success unconditionally:
 *
 * ```js
 * fetch(url, { method: "POST", mode: "no-cors", body });
 * setShowToast(true);   // never awaited, never checked
 * ```
 *
 * Two separate problems. The promise was never awaited, so the toast appeared
 * before the request had gone anywhere; and `mode: "no-cors"` yields an *opaque*
 * response whose status is unreadable by construction, so even awaiting it tells
 * you nothing. A learner on a plane with no signal was thanked for feedback that
 * was silently dropped.
 *
 * `no-cors` is genuinely required here — Google Forms sends no CORS headers, so
 * a readable response is not on offer. The honest fix is to await the request,
 * report a network-level failure when the fetch itself rejects, and word the
 * success message so it does not claim more than is actually known.
 */
export function FeedbackDialog({ isOpen, onClose }: FeedbackDialogProps): React.JSX.Element {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const fieldId = useId();

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (text.trim() === "") return;

    setStatus("sending");
    try {
      const body = new URLSearchParams({ [GOOGLE_FORM_FIELD]: text });
      await fetch(GOOGLE_FORM_ACTION, { method: "POST", mode: "no-cors", body });
      setStatus("sent");
      setText("");
    } catch {
      // Reachable: DNS failure, offline, request blocked. Not reachable: an
      // HTTP error status, which an opaque response hides.
      setStatus("failed");
    }
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Leave feedback">
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label htmlFor={fieldId} className="feedback-label">
          What could be better?
        </label>
        <textarea
          id={fieldId}
          className="feedback-input"
          value={text}
          rows={5}
          onChange={(event) => {
            setText(event.target.value);
          }}
          required
        />

        <div className="dialog-actions">
          <button type="button" className="text-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={status === "sending" || text.trim() === ""}
          >
            {status === "sending" ? "Sending…" : "Send"}
          </button>
        </div>

        {/* role="status" announces without stealing focus mid-typing. */}
        <p role="status" className="feedback-status">
          {status === "sent" && "Thanks — your feedback has been submitted."}
          {status === "failed" && "Could not send. Check your connection and try again."}
        </p>
      </form>
    </Dialog>
  );
}
