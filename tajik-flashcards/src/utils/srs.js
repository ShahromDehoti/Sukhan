// src/utils/srs.js
// Spaced Repetition System for word-level progress tracking

const STORAGE_KEY = "sukhan_word_progress";

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;

/**
 * Get all word progress data
 * @returns {Object} - { wordId: { rating, interval, ease, nextReview, reviewCount, lastSeen } }
 */
export function getWordProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Save word progress
 */
function saveWordProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

/**
 * Generate a unique word ID - now uses Supabase ID
 * @param {number|string} id - Supabase word ID
 */
export function getWordId(id) {
  return `word_${id}`;
}

/**
 * Get progress for a specific word
 */
export function getWordData(wordId) {
  const progress = getWordProgress();
  return progress[wordId] || null;
}

/**
 * Record that a word was seen (initial exposure in lesson)
 * @param {number|string} id - Supabase word ID
 */
export function markWordSeen(id) {
  const wordId = getWordId(id);
  const progress = getWordProgress();
  if (!progress[wordId]) {
    progress[wordId] = {
      rating: null,
      interval: 1,
      ease: DEFAULT_EASE,
      nextReview: null,
      reviewCount: 0,
      lastSeen: new Date().toISOString().split("T")[0],
    };
    saveWordProgress(progress);
  }
}

/**
 * Record a rating for a word (SRS update)
 * @param {number|string} id - Supabase word ID
 * @param {"again" | "hard" | "good" | "easy"} rating
 */
export function rateWord(id, rating) {
  const wordId = getWordId(id);
  const progress = getWordProgress();
  const today = new Date().toISOString().split("T")[0];

  const word = progress[wordId] || {
    rating: null,
    interval: 1,
    ease: DEFAULT_EASE,
    nextReview: null,
    reviewCount: 0,
    lastSeen: today,
  };

  // Update based on rating (simplified SM-2 algorithm)
  switch (rating) {
    case "again":
      word.interval = 1;
      word.ease = Math.max(MIN_EASE, word.ease - 0.2);
      break;
    case "hard":
      word.interval = Math.max(1, Math.round(word.interval * 1.2));
      word.ease = Math.max(MIN_EASE, word.ease - 0.15);
      break;
    case "good":
      word.interval = Math.round(word.interval * word.ease);
      break;
    case "easy":
      word.interval = Math.round(word.interval * word.ease * 1.3);
      word.ease = word.ease + 0.15;
      break;
  }

  // Calculate next review date
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + word.interval);

  word.rating = rating;
  word.nextReview = nextDate.toISOString().split("T")[0];
  word.reviewCount = (word.reviewCount || 0) + 1;
  word.lastSeen = today;

  progress[wordId] = word;
  saveWordProgress(progress);

  return word;
}

/**
 * Get words that were rated as difficult (again or hard)
 * @param {Array} words - Array of word objects with id property
 * @returns {Array} - Filtered words that were hard
 */
export function getHardWords(words) {
  const progress = getWordProgress();
  return words.filter((word) => {
    const wordId = getWordId(word.id);
    const data = progress[wordId];
    return data && (data.rating === "again" || data.rating === "hard");
  });
}

/**
 * Get words that were rated as easier (good or easy)
 * @param {Array} words - Array of word objects with id property
 * @returns {Array} - Filtered words that were easy
 */
export function getEasyWords(words) {
  const progress = getWordProgress();
  return words.filter((word) => {
    const wordId = getWordId(word.id);
    const data = progress[wordId];
    return data && (data.rating === "good" || data.rating === "easy");
  });
}

/**
 * Get all words from completed lessons in a unit up to a certain point
 * @param {Array} lessons - Array of lesson objects (with words arrays)
 * @param {number} upToLesson - Include words from lessons 0 to upToLesson (inclusive)
 * @returns {Array} - All word objects
 */
export function getWordsUpToLesson(lessons, upToLesson) {
  const words = [];
  for (let i = 0; i <= upToLesson && i < lessons.length; i++) {
    words.push(...lessons[i].words);
  }
  return words;
}

/**
 * Get words for mid-unit review (focus on hard words, but include 70% of covered material)
 * @param {Array} lessons - Unit lessons
 * @param {number} upToLesson - Lessons completed so far
 * @returns {Array} - Words for review
 */
export function getMidUnitReviewWords(lessons, upToLesson) {
  const allWords = getWordsUpToLesson(lessons, upToLesson);
  const targetCount = Math.ceil(allWords.length * 0.7);

  const hardWords = getHardWords(allWords);

  if (hardWords.length >= targetCount) {
    return hardWords.sort(() => Math.random() - 0.5);
  }

  const hardWordIds = new Set(hardWords.map((w) => w.id));
  const otherWords = allWords.filter((w) => !hardWordIds.has(w.id));

  const shuffledOthers = [...otherWords].sort(() => Math.random() - 0.5);
  const neededCount = targetCount - hardWords.length;
  const selectedOthers = shuffledOthers.slice(0, neededCount);

  const reviewWords = [...hardWords, ...selectedOthers];
  return reviewWords.sort(() => Math.random() - 0.5);
}

/**
 * Get words for end-of-unit review (70% coverage, hard words priority + mix of easier)
 * @param {Array} lessons - Unit lessons
 * @returns {Array} - Words for review
 */
export function getEndUnitReviewWords(lessons) {
  const allWords = getWordsUpToLesson(lessons, lessons.length - 1);
  const targetCount = Math.ceil(allWords.length * 0.7);

  const hardWords = getHardWords(allWords);

  if (hardWords.length >= targetCount) {
    return hardWords.sort(() => Math.random() - 0.5);
  }

  const hardWordIds = new Set(hardWords.map((w) => w.id));
  const otherWords = allWords.filter((w) => !hardWordIds.has(w.id));

  const shuffledOthers = [...otherWords].sort(() => Math.random() - 0.5);
  const neededCount = targetCount - hardWords.length;
  const selectedOthers = shuffledOthers.slice(0, neededCount);

  const reviewWords = [...hardWords, ...selectedOthers];
  return reviewWords.sort(() => Math.random() - 0.5);
}

/**
 * Get 5 random words for quiz from a unit
 * @param {Array} lessons - Unit lessons
 * @returns {Array} - 5 word objects for quiz
 */
export function getQuizWords(lessons) {
  const allWords = getWordsUpToLesson(lessons, lessons.length - 1);
  const shuffled = [...allWords].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(5, shuffled.length));
}

/**
 * Shuffle translations so they don't align with their words
 * @param {Array} words - Array of word objects
 * @returns {Array} - Shuffled translations
 */
export function shuffleTranslations(words) {
  if (words.length <= 1) return words.map((w) => w.english);

  const translations = words.map((w) => w.english);
  let shuffled;
  let attempts = 0;

  do {
    shuffled = [...translations].sort(() => Math.random() - 0.5);
    attempts++;
  } while (attempts < 50 && shuffled.some((t, i) => t === translations[i]));

  return shuffled;
}

/**
 * Reset all word progress (for testing)
 */
export function resetWordProgress() {
  localStorage.removeItem(STORAGE_KEY);
}
