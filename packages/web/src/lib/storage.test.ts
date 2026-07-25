import { EMPTY_PROGRESS, Rating, review } from "@sukhan/core";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  __resetCachesForTests,
  loadCards,
  loadProgress,
  loadSettings,
  migrateLegacyCards,
  resetProgress,
  saveCard,
  saveProgress,
  saveSettings,
  subscribe,
} from "./storage.js";

const NOW = new Date("2026-05-01T10:00:00.000Z");

function seedRaw(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
  __resetCachesForTests();
}

describe("progress persistence", () => {
  it("starts empty and round-trips", () => {
    expect(loadProgress()).toEqual(EMPTY_PROGRESS);

    const updated = { ...EMPTY_PROGRESS, completedLessons: new Set(["lesson-1"]) };
    saveProgress(updated);
    __resetCachesForTests();

    expect([...loadProgress().completedLessons]).toEqual(["lesson-1"]);
  });

  it("reads records written by the pre-TypeScript version", () => {
    seedRaw("sukhan_progress", {
      completedLessons: ["lesson-1", "lesson-2"],
      completedReviews: ["review-unit-1-2"],
      completedQuizzes: ["quiz-unit-1"],
    });

    const progress = loadProgress();
    expect(progress.completedLessons.size).toBe(2);
    expect(progress.completedQuizzes.has("quiz-unit-1")).toBe(true);
  });

  it("falls back to empty rather than throwing on corrupt JSON", () => {
    localStorage.setItem("sukhan_progress", "{not valid json");
    __resetCachesForTests();
    expect(loadProgress()).toEqual(EMPTY_PROGRESS);
  });

  it("clears on reset", () => {
    saveProgress({ ...EMPTY_PROGRESS, completedLessons: new Set(["lesson-1"]) });
    resetProgress();
    expect(loadProgress().completedLessons.size).toBe(0);
  });
});

describe("card persistence", () => {
  it("round-trips a scheduled card", () => {
    const card = review(null, Rating.Good, NOW);
    saveCard(42, card);
    __resetCachesForTests();

    const loaded = loadCards().get(42);
    expect(loaded).toEqual(card);
  });

  it("discards entries that are not valid card states", () => {
    seedRaw("sukhan_cards_v2", {
      "1": { stability: 5, difficulty: 5, due: "x", lastReviewedAt: "y", reps: 1, lapses: 0, scheduledDays: 5 },
      "2": { nonsense: true },
      "3": null,
      notANumber: { stability: 1, difficulty: 1, due: "x", lastReviewedAt: "y" },
    });

    const cards = loadCards();
    expect(cards.has(1)).toBe(true);
    expect(cards.has(2)).toBe(false);
    expect(cards.has(3)).toBe(false);
    expect(cards.size).toBe(1);
  });

  it("keeps existing cards when saving another", () => {
    saveCard(1, review(null, Rating.Good, NOW));
    saveCard(2, review(null, Rating.Easy, NOW));
    expect(loadCards().size).toBe(2);
  });
});

describe("settings", () => {
  it("defaults to showing both pronunciations", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips", () => {
    saveSettings({ pronunciation: "cyrillic" });
    expect(loadSettings().pronunciation).toBe("cyrillic");
  });

  it("accepts the original `pronunciationDisplay` key", () => {
    seedRaw("sukhan_settings", { pronunciationDisplay: "latin" });
    expect(loadSettings().pronunciation).toBe("latin");
  });

  it("rejects an unrecognised mode rather than trusting stored input", () => {
    seedRaw("sukhan_settings", { pronunciation: "javascript" });
    expect(loadSettings().pronunciation).toBe("both");
  });
});

describe("migrateLegacyCards", () => {
  it("seeds FSRS cards from the old SM-2 records", () => {
    seedRaw("sukhan_word_progress", {
      word_1: { interval: 10, ease: 2.5, nextReview: "2026-05-11T00:00:00.000Z", reviewCount: 4 },
      word_2: { interval: 1, ease: 1.3, nextReview: "2026-05-02T00:00:00.000Z", reviewCount: 1 },
    });

    expect(migrateLegacyCards(NOW)).toBe(2);

    const cards = loadCards();
    const easy = cards.get(1)!;
    const hard = cards.get(2)!;

    // Interval maps across as stability.
    expect(easy.stability).toBe(10);
    expect(hard.stability).toBe(1);
    // Higher SM-2 ease means an easier card, so lower FSRS difficulty.
    expect(easy.difficulty).toBeLessThan(hard.difficulty);
    expect(hard.difficulty).toBe(10);
    expect(easy.reps).toBe(4);
    expect(easy.due).toBe("2026-05-11T00:00:00.000Z");
  });

  it("runs only once", () => {
    seedRaw("sukhan_word_progress", { word_1: { interval: 5, ease: 2.5 } });
    expect(migrateLegacyCards(NOW)).toBe(2 - 1);
    expect(migrateLegacyCards(NOW)).toBe(0);
  });

  it("leaves the original key untouched so the migration is reversible", () => {
    const legacy = { word_1: { interval: 5, ease: 2.5 } };
    seedRaw("sukhan_word_progress", legacy);
    migrateLegacyCards(NOW);
    expect(JSON.parse(localStorage.getItem("sukhan_word_progress")!)).toEqual(legacy);
  });

  it("does nothing when there is no legacy data", () => {
    expect(migrateLegacyCards(NOW)).toBe(0);
    expect(loadCards().size).toBe(0);
  });

  it("skips malformed legacy entries without aborting the migration", () => {
    seedRaw("sukhan_word_progress", {
      word_1: { interval: 5, ease: 2.5 },
      word_bad: { interval: 5 },
      not_a_word_key: null,
    });
    expect(migrateLegacyCards(NOW)).toBe(1);
  });

  it("invents a due date when the legacy record lacks one", () => {
    seedRaw("sukhan_word_progress", { word_1: { interval: 3, ease: 2.5 } });
    migrateLegacyCards(NOW);
    const card = loadCards().get(1)!;
    expect(new Date(card.due).getTime()).toBe(NOW.getTime() + 3 * 86_400_000);
  });
});

describe("resilience when localStorage is unavailable", () => {
  it("degrades to memory rather than crashing when writes throw", () => {
    // Safari private mode and exhausted quota both surface this way.
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("denied");
      },
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    });
    __resetCachesForTests();

    expect(() => saveProgress({ ...EMPTY_PROGRESS, completedLessons: new Set(["l1"]) })).not.toThrow();

    // Drop the memo but keep the fallback, forcing a real read back through it.
    __resetCachesForTests(true);
    expect([...loadProgress().completedLessons]).toEqual(["l1"]);
  });

  it("does not throw when reads are blocked and nothing has been written", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("denied");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    });
    __resetCachesForTests();

    expect(() => loadProgress()).not.toThrow();
    expect(loadProgress()).toEqual(EMPTY_PROGRESS);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadCards().size).toBe(0);
  });
});

describe("subscribe", () => {
  it("notifies listeners on write and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    saveProgress({ ...EMPTY_PROGRESS, completedLessons: new Set(["l1"]) });
    expect(listener).toHaveBeenCalledTimes(1);

    saveSettings({ pronunciation: "none" });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    saveSettings({ pronunciation: "both" });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
