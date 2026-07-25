import type { Word } from "@sukhan/core";
import { useId } from "react";
import { speak } from "../lib/audio.js";
import type { PronunciationMode } from "../lib/storage.js";

interface FlashcardProps {
  readonly word: Word;
  readonly isFlipped: boolean;
  readonly onFlip: () => void;
  readonly pronunciation: PronunciationMode;
  /** Shown under the translations, e.g. "Rate your recall below". */
  readonly backHint?: string;
}

/**
 * The flashcard.
 *
 * ## Accessibility, which the original had none of
 *
 * The original rendered the card as `<div onClick={...}>`. The app's central
 * interaction — revealing a translation — was therefore reachable by mouse
 * only: no keyboard focus, no Enter/Space, no role, and nothing announced when
 * the content changed. The whole codebase contained zero `aria-*`, `role`,
 * `tabIndex`, or `onKeyDown` attributes.
 *
 * Four things fix it:
 *
 *  - The flip target is a real `<button>`, so focus, Enter, and Space work
 *    without a single key handler of our own.
 *  - `aria-pressed` communicates flip state, making the button a toggle rather
 *    than an action of unknown effect.
 *  - The revealed translation is mirrored into an `aria-live` region, so a
 *    screen-reader user hears the answer appear instead of silence.
 *  - The audio control is a **sibling** of the flip button, not a child.
 *    Nesting one button inside another is invalid HTML and browsers resolve it
 *    unpredictably; the original relied on `stopPropagation` to paper over it.
 *
 * ## Language tagging
 *
 * Each script carries its own `lang`. This is not decorative: it tells a screen
 * reader to switch voices, so Tajik is read with Cyrillic phonetics and the
 * Russian gloss in Russian, rather than all three being read as though they
 * were English.
 */
export function Flashcard({
  word,
  isFlipped,
  onFlip,
  pronunciation,
  backHint,
}: FlashcardProps): React.JSX.Element {
  const showLatin = pronunciation === "both" || pronunciation === "latin";
  const showCyrillic = pronunciation === "both" || pronunciation === "cyrillic";
  const announcementId = useId();

  return (
    <div className={`flashcard${isFlipped ? " flashcard--flipped" : ""}`}>
      <button
        type="button"
        className="flashcard-flip"
        aria-pressed={isFlipped}
        onClick={onFlip}
      >
        <span className="flashcard-inner">
          <span className="flashcard-face flashcard-front">
            <span className="flashcard-tajik" lang="tg">
              {word.tajik}
            </span>
            {showLatin && word.pronunciationLatin !== "" && (
              <span className="flashcard-pron-latin">{word.pronunciationLatin}</span>
            )}
            {showCyrillic && word.pronunciationCyrillic !== "" && (
              <span className="flashcard-pron-cyr">{word.pronunciationCyrillic}</span>
            )}
            <span className="flashcard-hint">
              {isFlipped ? "Hide translations" : "Show translations"}
            </span>
          </span>

          <span className="flashcard-face flashcard-back">
            <span className="flashcard-translation">
              English: <strong lang="en">{word.english}</strong>
            </span>
            <span className="flashcard-translation">
              Russian: <strong lang="ru">{word.russian}</strong>
            </span>
            {backHint !== undefined && <span className="flashcard-hint">{backHint}</span>}
          </span>
        </span>
      </button>

      <button
        type="button"
        className="audio-button"
        // Without this the button announces only as "button" — or, with the
        // emoji as its content, as "speaker with sound waves button".
        aria-label={`Play pronunciation of ${word.tajik}`}
        onClick={() => {
          void speak(word.tajik, word.audioPath);
        }}
      >
        <span aria-hidden="true">🔊</span>
      </button>

      {/*
        Screen readers do not announce content that merely becomes visible via a
        CSS transform, so the answer is mirrored into a live region. `atomic`
        makes it read as one phrase rather than word by word.
      */}
      <div id={announcementId} className="visually-hidden" aria-live="polite" aria-atomic="true">
        {isFlipped ? `${word.tajik}. English: ${word.english}. Russian: ${word.russian}.` : ""}
      </div>
    </div>
  );
}
