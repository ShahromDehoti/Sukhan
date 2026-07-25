import { useSettings } from "../hooks/useStoredState.js";
import { PRONUNCIATION_MODES, type PronunciationMode } from "../lib/storage.js";
import { Dialog } from "./Dialog.js";

const LABELS: Record<PronunciationMode, string> = {
  both: "Both Latin and Cyrillic",
  latin: "Latin only",
  cyrillic: "Cyrillic only",
  none: "Hide pronunciation",
};

interface SettingsDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps): React.JSX.Element {
  const [settings, setSettings] = useSettings();

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Settings">
      {/*
        A fieldset with a legend is what makes a radio group announce as one
        named group; the original used a bare list of inputs, so each option was
        read without any indication of what it was choosing between.
      */}
      <fieldset className="settings-group">
        <legend className="settings-legend">Pronunciation guide</legend>
        {PRONUNCIATION_MODES.map((mode) => (
          <label key={mode} className="settings-option">
            <input
              type="radio"
              name="pronunciation"
              value={mode}
              checked={settings.pronunciation === mode}
              onChange={() => {
                setSettings({ pronunciation: mode });
              }}
            />
            <span>{LABELS[mode]}</span>
          </label>
        ))}
      </fieldset>

      <button type="button" className="primary-button" onClick={onClose}>
        Done
      </button>
    </Dialog>
  );
}
