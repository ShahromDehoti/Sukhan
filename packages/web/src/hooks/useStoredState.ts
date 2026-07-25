import type { CardState, Progress } from "@sukhan/core";
import { useCallback, useSyncExternalStore } from "react";
import {
  loadCards,
  loadProgress,
  loadSettings,
  saveCard,
  saveProgress,
  saveSettings,
  subscribe,
  type CardsByWordId,
  type Settings,
} from "../lib/storage.js";

/**
 * React bindings for persisted state.
 *
 * ## What this replaces
 *
 * The original read `localStorage` *during render* — `isLessonComplete(...)`
 * was called directly inside JSX — and then, because writing to storage does
 * not notify React, kept a counter whose only purpose was to force a re-render:
 *
 * ```js
 * const [, setProgressTick] = useState(0);
 * // ...and, after every mutation:
 * setProgressTick((t) => t + 1);
 * ```
 *
 * Every mutation had to remember to bump it, and forgetting produced a UI that
 * was silently a step behind its own data.
 *
 * `useSyncExternalStore` is the purpose-built answer: the store publishes
 * changes, React subscribes, and no component has to remember anything. It is
 * also correct under concurrent rendering, which the tick was not.
 */

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, loadProgress, loadProgress);
}

export function useCards(): CardsByWordId {
  return useSyncExternalStore(subscribe, loadCards, loadCards);
}

export function useSettings(): [Settings, (next: Settings) => void] {
  const settings = useSyncExternalStore(subscribe, loadSettings, loadSettings);
  const update = useCallback((next: Settings) => {
    saveSettings(next);
  }, []);
  return [settings, update];
}

export { saveCard, saveProgress };
export type { CardState, Settings };
