/**
 * Browser persistence.
 *
 * All `localStorage` access in the application is confined to this module. The
 * original scattered reads and writes through `progress.js`, `srs.js`, and
 * `settings.js`, calling them from inside functions that otherwise looked pure
 * and reading them *during render* — which is why `App.jsx` needed a
 * `setProgressTick` counter to force React to notice its own writes.
 *
 * Here, storage is an explicit boundary: the domain stays pure, and React
 * subscribes to changes through `useSyncExternalStore` instead of a tick hack.
 */

import {
  EMPTY_PROGRESS,
  fromSnapshot,
  toSnapshot,
  type CardState,
  type Progress,
} from "@sukhan/core";

const KEYS = {
  progress: "sukhan_progress",
  cards: "sukhan_cards_v2",
  legacyCards: "sukhan_word_progress",
  settings: "sukhan_settings",
} as const;

/**
 * A `localStorage` that cannot throw.
 *
 * `localStorage` is not always available or writable: Safari's private mode
 * historically threw on `setItem`, quota can be exhausted, and embedded
 * WebViews can disable storage entirely. Accessing it can even throw on *read*
 * when cookies are blocked. A learner in that situation should get an app that
 * forgets its state, not one that crashes on load.
 */
const memoryFallback = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    memoryFallback.set(key, value);
  }
}

function readJson<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt entry — a half-written value or something else's key collision.
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Change notification
// ---------------------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to local changes. Pairs with `useSyncExternalStore`. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

let progressCache: Progress | null = null;

export function loadProgress(): Progress {
  progressCache ??= fromSnapshot(readJson<unknown>(KEYS.progress, null));
  return progressCache;
}

export function saveProgress(progress: Progress): void {
  progressCache = progress;
  writeRaw(KEYS.progress, JSON.stringify(toSnapshot(progress)));
  notify();
}

export function resetProgress(): void {
  progressCache = EMPTY_PROGRESS;
  writeRaw(KEYS.progress, JSON.stringify(toSnapshot(EMPTY_PROGRESS)));
  notify();
}

// ---------------------------------------------------------------------------
// Scheduling cards
// ---------------------------------------------------------------------------

export type CardsByWordId = ReadonlyMap<number, CardState>;

let cardsCache: Map<number, CardState> | null = null;

function isCardState(value: unknown): value is CardState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CardState>;
  return (
    typeof candidate.stability === "number" &&
    typeof candidate.difficulty === "number" &&
    typeof candidate.due === "string" &&
    typeof candidate.lastReviewedAt === "string"
  );
}

export function loadCards(): CardsByWordId {
  if (cardsCache !== null) return cardsCache;

  const stored = readJson<Record<string, unknown>>(KEYS.cards, {});
  const cards = new Map<number, CardState>();
  for (const [key, value] of Object.entries(stored)) {
    const id = Number(key);
    if (Number.isFinite(id) && isCardState(value)) cards.set(id, value);
  }

  cardsCache = cards;
  return cards;
}

export function saveCard(wordId: number, card: CardState): void {
  const cards = new Map(loadCards());
  cards.set(wordId, card);
  cardsCache = cards;
  writeRaw(KEYS.cards, JSON.stringify(Object.fromEntries(cards)));
  notify();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const PRONUNCIATION_MODES = ["both", "latin", "cyrillic", "none"] as const;
export type PronunciationMode = (typeof PRONUNCIATION_MODES)[number];

export interface Settings {
  readonly pronunciation: PronunciationMode;
}

export const DEFAULT_SETTINGS: Settings = { pronunciation: "both" };

let settingsCache: Settings | null = null;

/**
 * Memoised, and deliberately so. `useSyncExternalStore` compares the value it
 * gets back by reference and re-renders when it changes — so a getter that
 * built a fresh object on every call would report a change on every render and
 * loop forever. Every loader in this module returns a stable reference.
 */
export function loadSettings(): Settings {
  if (settingsCache !== null) return settingsCache;

  const stored = readJson<Record<string, unknown>>(KEYS.settings, {});
  // The original wrote this under `pronunciationDisplay`; accept either.
  const raw = stored.pronunciation ?? stored.pronunciationDisplay;
  const mode = PRONUNCIATION_MODES.find((candidate) => candidate === raw);
  settingsCache = { pronunciation: mode ?? DEFAULT_SETTINGS.pronunciation };
  return settingsCache;
}

export function saveSettings(settings: Settings): void {
  settingsCache = settings;
  writeRaw(KEYS.settings, JSON.stringify(settings));
  notify();
}

// ---------------------------------------------------------------------------
// Migration from the pre-FSRS format
// ---------------------------------------------------------------------------

interface LegacyCard {
  interval?: unknown;
  ease?: unknown;
  nextReview?: unknown;
  lastSeen?: unknown;
  reviewCount?: unknown;
}

/**
 * Seed FSRS cards from the old SM-2-style records, once.
 *
 * The old format stored `{ interval, ease, nextReview, reviewCount, lastSeen }`;
 * FSRS needs `{ stability, difficulty }`. There is no exact conversion, but
 * discarding the data outright would reset every learner's schedule to zero,
 * which is a worse outcome than an approximate seed:
 *
 *  - `stability ← interval`. Both are "days until recall drops to ~90%", so
 *    this is close to a like-for-like mapping.
 *  - `difficulty ← ease`, inverted and rescaled. SM-2 ease runs [1.3, 2.5+]
 *    where *higher* is easier; FSRS difficulty runs [1, 10] where *higher* is
 *    harder.
 *
 * Both are estimates, and FSRS re-converges within a few reviews regardless.
 * The migration writes to a new key and leaves the old one untouched, so it is
 * reversible and can only run once.
 */
export function migrateLegacyCards(now: Date = new Date()): number {
  if (readRaw(KEYS.cards) !== null) return 0; // already migrated
  const legacy = readJson<Record<string, LegacyCard> | null>(KEYS.legacyCards, null);
  if (legacy === null) return 0;

  const cards = new Map<number, CardState>();
  for (const [key, value] of Object.entries(legacy)) {
    const id = Number(key.replace(/^word_/, ""));
    if (!Number.isFinite(id) || typeof value !== "object" || value === null) continue;

    const interval = typeof value.interval === "number" ? value.interval : 1;
    const ease = typeof value.ease === "number" ? value.ease : 2.5;
    const lastSeen = typeof value.lastSeen === "string" ? value.lastSeen : now.toISOString();
    const nextReview = typeof value.nextReview === "string" ? value.nextReview : null;
    const reps = typeof value.reviewCount === "number" ? value.reviewCount : 1;

    const stability = Math.max(0.1, interval);
    // ease 2.5 (the SM-2 default) maps to the middle of the difficulty range;
    // the floor of 1.3 maps to the hard end.
    const normalisedEase = Math.min(Math.max((ease - 1.3) / (2.5 - 1.3), 0), 1);
    const difficulty = Math.min(Math.max(10 - normalisedEase * 5, 1), 10);

    cards.set(id, {
      stability,
      difficulty,
      due: nextReview ?? new Date(now.getTime() + stability * 86_400_000).toISOString(),
      lastReviewedAt: lastSeen,
      reps,
      lapses: 0, // not recorded by the old format
      scheduledDays: Math.round(stability),
    });
  }

  if (cards.size > 0) {
    cardsCache = cards;
    writeRaw(KEYS.cards, JSON.stringify(Object.fromEntries(cards)));
    notify();
  }
  return cards.size;
}

/**
 * Test seam: drop memoised state so a test can start from a clean slate.
 *
 * `keepFallback` retains the in-memory store that stands in for an unavailable
 * `localStorage`. That distinction matters when testing the fallback itself:
 * clearing the memo forces a genuine re-read, while clearing the fallback too
 * would delete the data under test.
 */
export function __resetCachesForTests(keepFallback = false): void {
  progressCache = null;
  cardsCache = null;
  settingsCache = null;
  if (!keepFallback) memoryFallback.clear();
}
