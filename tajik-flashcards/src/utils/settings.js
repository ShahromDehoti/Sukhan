// src/utils/settings.js
// Manages user settings in localStorage

const STORAGE_KEY = "sukhan_settings";

const DEFAULT_SETTINGS = {
  pronunciationDisplay: "both", // "both" | "cyrillic" | "latin" | "none"
};

/**
 * Get all settings from localStorage
 * @returns {Object} - Settings object
 */
export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings to localStorage
 * @param {Object} settings - Settings to save
 */
export function saveSettings(settings) {
  const current = getSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Get pronunciation display preference
 * @returns {"both" | "cyrillic" | "latin" | "none"}
 */
export function getPronunciationDisplay() {
  return getSettings().pronunciationDisplay;
}

/**
 * Set pronunciation display preference
 * @param {"both" | "cyrillic" | "latin" | "none"} value
 */
export function setPronunciationDisplay(value) {
  saveSettings({ pronunciationDisplay: value });
}

