// src/utils/progress.js
// Manages lesson, review, and quiz completion progress in localStorage

const STORAGE_KEY = "sukhan_progress";

/**
 * Get all progress data from localStorage
 * @returns {{ completedLessons: string[], completedReviews: string[], completedQuizzes: string[] }}
 */
export function getProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completedLessons: [], completedReviews: [], completedQuizzes: [] };
    const data = JSON.parse(raw);
    // Ensure all arrays exist for backwards compatibility
    return {
      completedLessons: data.completedLessons || [],
      completedReviews: data.completedReviews || [],
      completedQuizzes: data.completedQuizzes || [],
    };
  } catch {
    return { completedLessons: [], completedReviews: [], completedQuizzes: [] };
  }
}

/**
 * Save progress to localStorage
 */
function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

/**
 * Mark a lesson as completed
 * @param {string} lessonId - e.g. "lesson-1-1"
 */
export function markLessonComplete(lessonId) {
  const progress = getProgress();
  if (!progress.completedLessons.includes(lessonId)) {
    progress.completedLessons.push(lessonId);
    saveProgress(progress);
  }
}

/**
 * Check if a lesson is completed
 * @param {string} lessonId
 * @returns {boolean}
 */
export function isLessonComplete(lessonId) {
  const progress = getProgress();
  return progress.completedLessons.includes(lessonId);
}

/**
 * Mark a review checkpoint as completed
 * @param {string} reviewId - e.g. "review-1-2" (unit 1, after lesson 2)
 */
export function markReviewComplete(reviewId) {
  const progress = getProgress();
  if (!progress.completedReviews.includes(reviewId)) {
    progress.completedReviews.push(reviewId);
    saveProgress(progress);
  }
}

/**
 * Check if a review is completed
 * @param {string} reviewId
 * @returns {boolean}
 */
export function isReviewComplete(reviewId) {
  const progress = getProgress();
  return progress.completedReviews.includes(reviewId);
}

/**
 * Mark a unit quiz as completed
 * @param {string} quizId - e.g. "quiz-1" (unit 1)
 */
export function markQuizComplete(quizId) {
  const progress = getProgress();
  if (!progress.completedQuizzes.includes(quizId)) {
    progress.completedQuizzes.push(quizId);
    saveProgress(progress);
  }
}

/**
 * Check if a quiz is completed
 * @param {string} quizId
 * @returns {boolean}
 */
export function isQuizComplete(quizId) {
  const progress = getProgress();
  return progress.completedQuizzes.includes(quizId);
}

/**
 * Check if a lesson is unlocked
 * Considers lessons, reviews, and the unit flow
 * @param {string} lessonId
 * @param {object[]} lessons - array of lesson objects in the unit
 * @param {string} unitId - the unit ID for review checks
 * @returns {boolean}
 */
export function isLessonUnlocked(lessonId, lessons, unitId) {
  const lessonIndex = lessons.findIndex((l) => l.id === lessonId);
  if (lessonIndex === 0) return true; // First lesson is always unlocked

  const previousLesson = lessons[lessonIndex - 1];
  const previousLessonComplete = isLessonComplete(previousLesson.id);

  // Check if a review is required before this lesson
  // Reviews happen after lessons 2, 4, 6, etc. (indices 1, 3, 5)
  // So lesson at index 2 requires review after lesson 2 to be done
  const previousLessonNumber = lessonIndex; // lessonIndex is 0-based, so index 1 = lesson 2
  if (previousLessonNumber >= 2 && previousLessonNumber % 2 === 0) {
    const reviewId = `review-${unitId}-${previousLessonNumber}`;
    if (!isReviewComplete(reviewId)) {
      return previousLessonComplete; // Review not required to unlock, just lesson
    }
  }

  return previousLessonComplete;
}

/**
 * Check if a review checkpoint is unlocked
 * @param {number} afterLessonIndex - 0-based index of the lesson after which review appears
 * @param {object[]} lessons
 * @returns {boolean}
 */
export function isReviewUnlocked(afterLessonIndex, lessons) {
  // Review after lesson N is unlocked when lesson N is complete
  if (afterLessonIndex < 0 || afterLessonIndex >= lessons.length) return false;
  return isLessonComplete(lessons[afterLessonIndex].id);
}

/**
 * Check if end-of-unit review is unlocked
 * @param {object[]} lessons
 * @returns {boolean}
 */
export function isEndReviewUnlocked(lessons) {
  // End review unlocks when all lessons are complete
  return lessons.every((l) => isLessonComplete(l.id));
}

/**
 * Check if quiz is unlocked
 * @param {string} unitId
 * @param {object[]} lessons
 * @returns {boolean}
 */
export function isQuizUnlocked(unitId, lessons) {
  // Quiz unlocks when end review is complete
  const endReviewId = `review-${unitId}-end`;
  return isReviewComplete(endReviewId);
}

/**
 * Get count of completed lessons in a unit
 * @param {object[]} lessons - array of lesson objects
 * @returns {number}
 */
export function getUnitProgress(lessons) {
  const progress = getProgress();
  return lessons.filter((l) => progress.completedLessons.includes(l.id)).length;
}

/**
 * Build the full checkpoint list for a unit
 * Returns array of { type, id, title, ... } for lessons, reviews, quiz
 * @param {object} unit - unit object with id, lessons
 * @returns {Array}
 */
export function getUnitCheckpoints(unit) {
  const checkpoints = [];
  const lessons = unit.lessons;

  lessons.forEach((lesson, idx) => {
    // Add the lesson
    checkpoints.push({
      type: "lesson",
      ...lesson,
      lessonIndex: idx,
    });

    // Add mid-unit review after every 2 lessons (after index 1, 3, 5, etc.)
    if ((idx + 1) % 2 === 0 && idx < lessons.length - 1) {
      checkpoints.push({
        type: "review",
        id: `review-${unit.id}-${idx + 1}`,
        title: "Review",
        description: `Review words from lessons 1-${idx + 1}`,
        afterLessonIndex: idx,
        isEndReview: false,
      });
    }
  });

  // Add end-of-unit review
  checkpoints.push({
    type: "review",
    id: `review-${unit.id}-end`,
    title: "Final Review",
    description: "Review all words from this unit",
    afterLessonIndex: lessons.length - 1,
    isEndReview: true,
  });

  // Add quiz
  checkpoints.push({
    type: "quiz",
    id: `quiz-${unit.id}`,
    title: "Unit Quiz",
    description: "Match Tajik words with their translations",
  });

  return checkpoints;
}

/**
 * Reset all progress (for testing/debug)
 */
export function resetProgress() {
  localStorage.removeItem(STORAGE_KEY);
}
