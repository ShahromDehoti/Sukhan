// src/utils/progress.js
// Manages lesson completion progress in localStorage

const STORAGE_KEY = "sukhan_progress";

/**
 * Get all progress data from localStorage
 * @returns {{ completedLessons: string[] }}
 */
export function getProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completedLessons: [] };
    return JSON.parse(raw);
  } catch {
    return { completedLessons: [] };
  }
}

/**
 * Mark a lesson as completed
 * @param {string} lessonId - e.g. "lesson-1-1"
 */
export function markLessonComplete(lessonId) {
  const progress = getProgress();
  if (!progress.completedLessons.includes(lessonId)) {
    progress.completedLessons.push(lessonId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
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
 * Check if a lesson is unlocked (previous lesson in unit is complete, or it's the first)
 * @param {string} lessonId - e.g. "lesson-1-2"
 * @param {object[]} lessons - array of lesson objects in the unit
 * @returns {boolean}
 */
export function isLessonUnlocked(lessonId, lessons) {
  const lessonIndex = lessons.findIndex((l) => l.id === lessonId);
  if (lessonIndex === 0) return true; // First lesson is always unlocked
  
  const previousLesson = lessons[lessonIndex - 1];
  return isLessonComplete(previousLesson.id);
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
 * Reset all progress (for testing/debug)
 */
export function resetProgress() {
  localStorage.removeItem(STORAGE_KEY);
}

