// src/App.jsx
import { useState, useMemo } from "react";
import dictionary from "./data/dictionary.json";
import curriculum from "./data/curriculum.json";
import {
  isLessonComplete,
  markLessonComplete,
  getUnitProgress,
  getUnitCheckpoints,
  isReviewUnlocked,
  isEndReviewUnlocked,
  isReviewComplete,
  markReviewComplete,
  isQuizUnlocked,
  isQuizComplete,
  markQuizComplete,
} from "./utils/progress";
import {
  rateWord,
  getWordId,
  markWordSeen,
  getMidUnitReviewWords,
  getEndUnitReviewWords,
  getQuizWords,
  shuffleTranslations,
} from "./utils/srs";
import "./App.css";

const CATEGORY_LABELS = {
  greetings: "Greetings",
  food: "Food",
  people_family: "People & Family",
  weather_seasons: "Weather & Seasons",
  colors: "Colors",
  numbers: "Numbers",
  time: "Time",
  emotions_personality: "Emotions & Personality",
  verbs: "Verbs",
  adjectives: "Adjectives",
};

// Resolve word references from curriculum to actual word objects
function resolveWords(wordRefs) {
  return wordRefs
    .map((ref) => {
      const categoryWords = dictionary[ref.category];
      if (!categoryWords) return null;
      const word = categoryWords[ref.index];
      if (!word) return null;
      // Attach ref info for SRS tracking
      return { ...word, _category: ref.category, _index: ref.index };
    })
    .filter(Boolean);
}

function App() {
  // View: "home" | "unit" | "lesson" | "review" | "quiz" | "practice"
  const [view, setView] = useState("home");
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [selectedReview, setSelectedReview] = useState(null);

  // Flashcard state (shared between lesson, review, and practice modes)
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);

  // Review-specific state
  const [reviewWords, setReviewWords] = useState([]);
  const [hasRated, setHasRated] = useState(false);

  // Quiz state
  const [quizWords, setQuizWords] = useState([]);
  const [quizTranslations, setQuizTranslations] = useState([]);
  const [quizMatches, setQuizMatches] = useState({}); // { wordIndex: translationIndex }
  const [selectedWordIdx, setSelectedWordIdx] = useState(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  // Practice mode state
  const [category, setCategory] = useState("greetings");

  // Feedback modal state
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [showToast, setShowToast] = useState(false);

  // Force re-render when progress changes
  const [, setProgressTick] = useState(0);

  // Get words based on current mode
  const words = useMemo(() => {
    if (view === "lesson" && selectedLesson) {
      return resolveWords(selectedLesson.words);
    }
    if (view === "review") {
      return reviewWords;
    }
    if (view === "practice") {
      return dictionary[category] || [];
    }
    return [];
  }, [view, selectedLesson, reviewWords, category]);

  const current = words[index] || null;

  // Navigation handlers
  const handleNext = () => {
    if (!words.length) return;
    setShowBack(false);
    setHasRated(false);
    setIndex((prev) => (prev + 1) % words.length);
  };

  const handlePrev = () => {
    if (!words.length) return;
    setShowBack(false);
    setHasRated(false);
    setIndex((prev) => (prev - 1 + words.length) % words.length);
  };

  const handleCategoryChange = (key) => {
    setCategory(key);
    setIndex(0);
    setShowBack(false);
  };

  // View navigation
  const goHome = () => {
    setView("home");
    setSelectedUnit(null);
    setSelectedLesson(null);
    setSelectedReview(null);
    setIndex(0);
    setShowBack(false);
    setHasRated(false);
  };

  const goToUnit = () => {
    setView("unit");
    setSelectedLesson(null);
    setSelectedReview(null);
    setIndex(0);
    setShowBack(false);
    setHasRated(false);
    setQuizSubmitted(false);
    setProgressTick((t) => t + 1);
  };

  const openUnit = (unit) => {
    setSelectedUnit(unit);
    setView("unit");
  };

  const openLesson = (lesson) => {
    setSelectedLesson(lesson);
    setIndex(0);
    setShowBack(false);
    setView("lesson");
  };

  const openReview = (review) => {
    setSelectedReview(review);
    setIndex(0);
    setShowBack(false);
    setHasRated(false);

    // Get appropriate words for review
    let wordRefs;
    if (review.isEndReview) {
      wordRefs = getEndUnitReviewWords(selectedUnit.lessons);
    } else {
      wordRefs = getMidUnitReviewWords(selectedUnit.lessons, review.afterLessonIndex);
    }

    const resolved = resolveWords(wordRefs);
    setReviewWords(resolved);
    setView("review");
  };

  const openQuiz = () => {
    const wordRefs = getQuizWords(selectedUnit.lessons);
    const resolved = resolveWords(wordRefs);
    const translations = shuffleTranslations(resolved);

    setQuizWords(resolved);
    setQuizTranslations(translations);
    setQuizMatches({});
    setSelectedWordIdx(null);
    setQuizSubmitted(false);
    setQuizScore(0);
    setView("quiz");
  };

  const openPractice = () => {
    setCategory("greetings");
    setIndex(0);
    setShowBack(false);
    setView("practice");
  };

  const completeLesson = () => {
    if (selectedLesson) {
      // Mark all words as seen
      selectedLesson.words.forEach((ref) => {
        markWordSeen(getWordId(ref.category, ref.index));
      });
      markLessonComplete(selectedLesson.id);
      setProgressTick((t) => t + 1);
    }
    goToUnit();
  };

  const completeReview = () => {
    if (selectedReview) {
      markReviewComplete(selectedReview.id);
      setProgressTick((t) => t + 1);
    }
    goToUnit();
  };

  // SRS rating handler
  const handleRate = (rating) => {
    if (!current || !current._category) return;
    const wordId = getWordId(current._category, current._index);
    rateWord(wordId, rating);
    setHasRated(true);
  };

  // Quiz handlers
  const handleQuizWordClick = (idx) => {
    if (quizSubmitted) return;
    setSelectedWordIdx(idx);
  };

  const handleQuizTranslationClick = (idx) => {
    if (quizSubmitted || selectedWordIdx === null) return;

    // If this translation is already matched, unassign it
    const existingMatch = Object.entries(quizMatches).find(
      ([, tIdx]) => tIdx === idx
    );
    if (existingMatch) {
      const newMatches = { ...quizMatches };
      delete newMatches[existingMatch[0]];
      newMatches[selectedWordIdx] = idx;
      setQuizMatches(newMatches);
    } else {
      setQuizMatches({ ...quizMatches, [selectedWordIdx]: idx });
    }
    setSelectedWordIdx(null);
  };

  const submitQuiz = () => {
    let score = 0;
    quizWords.forEach((word, idx) => {
      const matchedTransIdx = quizMatches[idx];
      if (matchedTransIdx !== undefined) {
        if (quizTranslations[matchedTransIdx] === word.english) {
          score++;
        }
      }
    });
    setQuizScore(score);
    setQuizSubmitted(true);

    // Mark quiz complete if all correct
    if (score === quizWords.length) {
      markQuizComplete(`quiz-${selectedUnit.id}`);
      setProgressTick((t) => t + 1);
    }
  };

  // Text-to-speech
  const speak = (text) => {
    if (!window.speechSynthesis) return;

    const utterance = new SpeechSynthesisUtterance(text);

    const voices = window.speechSynthesis.getVoices();
    const russianVoice = voices.find((v) => v.lang.startsWith("ru"));

    if (russianVoice) utterance.voice = russianVoice;

    utterance.rate = 0.8;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
  };

  // ============ RENDER VIEWS ============

  // HOME VIEW
  if (view === "home") {
    return (
      <div className="app-root">
        <div className="app-wrapper">
          <div className="app-card">
            <header className="app-header">
              <div className="header-text">
                <h1 className="app-title">Sukhan</h1>
                <p className="app-subtitle">
                  Learn Tajik through structured lessons or free practice.
                </p>
              </div>
              <button
                className="ghost-button"
                onClick={() => setIsFeedbackOpen(true)}
              >
                Leave Feedback
              </button>
            </header>

            <div className="home-section">
              <h2 className="section-title">Learn</h2>
              <p className="section-desc">
                Structured lessons with reviews and quizzes to build your vocabulary.
              </p>
              <div className="unit-grid">
                {curriculum.units.map((unit) => {
                  const completed = getUnitProgress(unit.lessons);
                  const total = unit.lessons.length;
                  const quizDone = isQuizComplete(`quiz-${unit.id}`);
                  return (
                    <button
                      key={unit.id}
                      className={"unit-card" + (quizDone ? " unit-card--completed" : "")}
                      onClick={() => openUnit(unit)}
                    >
                      <div className="unit-card-title">
                        {unit.title}
                        {quizDone && <span className="unit-badge">✓</span>}
                      </div>
                      <div className="unit-card-desc">{unit.description}</div>
                      <div className="unit-card-progress">
                        {completed} / {total} lessons
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${(completed / total) * 100}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="home-section">
              <h2 className="section-title">Practice</h2>
              <p className="section-desc">
                Browse all vocabulary by category for free practice.
              </p>
              <button className="primary-button" onClick={openPractice}>
                Open Practice Mode →
              </button>
            </div>

            {renderFeedbackModal()}
            {showToast && (
              <div className="toast">Feedback sent! Thank you 🙌</div>
            )}
          </div>
          <footer className="global-footer">
            © {new Date().getFullYear()} Shahrom Dehoti
          </footer>
        </div>
      </div>
    );
  }

  // UNIT VIEW (checkpoints: lessons, reviews, quiz)
  if (view === "unit" && selectedUnit) {
    const checkpoints = getUnitCheckpoints(selectedUnit);

    return (
      <div className="app-root">
        <div className="app-wrapper">
          <div className="app-card">
            <header className="app-header">
              <div className="header-text">
                <button className="back-link" onClick={goHome}>
                  ← Back to Home
                </button>
                <h1 className="app-title">{selectedUnit.title}</h1>
                <p className="app-subtitle">{selectedUnit.description}</p>
              </div>
            </header>

            <div className="checkpoint-list">
              {checkpoints.map((cp, idx) => {
                if (cp.type === "lesson") {
                  const prevCheckpoint = idx > 0 ? checkpoints[idx - 1] : null;
                  let unlocked = cp.lessonIndex === 0;

                  if (prevCheckpoint) {
                    if (prevCheckpoint.type === "lesson") {
                      unlocked = isLessonComplete(prevCheckpoint.id);
                    } else if (prevCheckpoint.type === "review") {
                      unlocked = isReviewComplete(prevCheckpoint.id);
                    }
                  }

                  const completed = isLessonComplete(cp.id);

                  return (
                    <button
                      key={cp.id}
                      className={
                        "checkpoint-card checkpoint-card--lesson" +
                        (completed ? " checkpoint-card--completed" : "") +
                        (!unlocked ? " checkpoint-card--locked" : "")
                      }
                      onClick={() => unlocked && openLesson(cp)}
                      disabled={!unlocked}
                    >
                      <div className="checkpoint-icon">📖</div>
                      <div className="checkpoint-content">
                        <div className="checkpoint-title">{cp.title}</div>
                        <div className="checkpoint-desc">{cp.description}</div>
                        <div className="checkpoint-meta">{cp.words.length} words</div>
                      </div>
                      <div className="checkpoint-status">
                        {completed && <span className="status-check">✓</span>}
                        {!unlocked && <span className="status-lock">🔒</span>}
                      </div>
                    </button>
                  );
                }

                if (cp.type === "review") {
                  const unlocked = cp.isEndReview
                    ? isEndReviewUnlocked(selectedUnit.lessons)
                    : isReviewUnlocked(cp.afterLessonIndex, selectedUnit.lessons);
                  const completed = isReviewComplete(cp.id);

                  return (
                    <button
                      key={cp.id}
                      className={
                        "checkpoint-card checkpoint-card--review" +
                        (completed ? " checkpoint-card--completed" : "") +
                        (!unlocked ? " checkpoint-card--locked" : "")
                      }
                      onClick={() => unlocked && openReview(cp)}
                      disabled={!unlocked}
                    >
                      <div className="checkpoint-icon">🔄</div>
                      <div className="checkpoint-content">
                        <div className="checkpoint-title">{cp.title}</div>
                        <div className="checkpoint-desc">{cp.description}</div>
                        <div className="checkpoint-meta">Spaced repetition</div>
                      </div>
                      <div className="checkpoint-status">
                        {completed && <span className="status-check">✓</span>}
                        {!unlocked && <span className="status-lock">🔒</span>}
                      </div>
                    </button>
                  );
                }

                if (cp.type === "quiz") {
                  const unlocked = isQuizUnlocked(selectedUnit.id, selectedUnit.lessons);
                  const completed = isQuizComplete(cp.id);

                  return (
                    <button
                      key={cp.id}
                      className={
                        "checkpoint-card checkpoint-card--quiz" +
                        (completed ? " checkpoint-card--completed" : "") +
                        (!unlocked ? " checkpoint-card--locked" : "")
                      }
                      onClick={() => unlocked && openQuiz()}
                      disabled={!unlocked}
                    >
                      <div className="checkpoint-icon">🎯</div>
                      <div className="checkpoint-content">
                        <div className="checkpoint-title">{cp.title}</div>
                        <div className="checkpoint-desc">{cp.description}</div>
                        <div className="checkpoint-meta">Match 5 words</div>
                      </div>
                      <div className="checkpoint-status">
                        {completed && <span className="status-check">✓</span>}
                        {!unlocked && <span className="status-lock">🔒</span>}
                      </div>
                    </button>
                  );
                }

                return null;
              })}
            </div>
          </div>
          <footer className="global-footer">
            © {new Date().getFullYear()} Shahrom Dehoti
          </footer>
        </div>
      </div>
    );
  }

  // LESSON VIEW (flashcards with completion)
  if (view === "lesson" && selectedLesson) {
    const isLastCard = index === words.length - 1;
    const completed = isLessonComplete(selectedLesson.id);

    return (
      <div className="app-root">
        <div className="app-wrapper">
          <div className="app-card">
            <header className="app-header">
              <div className="header-text">
                <button className="back-link" onClick={goToUnit}>
                  ← Back to {selectedUnit?.title}
                </button>
                <h1 className="app-title">{selectedLesson.title}</h1>
                <p className="app-subtitle">{selectedLesson.description}</p>
              </div>
            </header>

            {current ? (
              <>
                {renderFlashcard(current)}
                <div className="nav-row">
                  <button className="primary-button" onClick={handlePrev}>
                    ← Previous
                  </button>
                  <span className="nav-counter">
                    {index + 1} / {words.length}
                  </span>
                  {isLastCard && !completed ? (
                    <button
                      className="primary-button complete-button"
                      onClick={completeLesson}
                    >
                      Complete ✓
                    </button>
                  ) : (
                    <button className="primary-button" onClick={handleNext}>
                      Next →
                    </button>
                  )}
                </div>
                {completed && (
                  <div className="lesson-complete-badge">✓ Lesson completed</div>
                )}
              </>
            ) : (
              <p>No words in this lesson.</p>
            )}
          </div>
          <footer className="global-footer">
            © {new Date().getFullYear()} Shahrom Dehoti
          </footer>
        </div>
      </div>
    );
  }

  // REVIEW VIEW (flashcards with SRS rating)
  if (view === "review" && selectedReview) {
    const isLastCard = index === words.length - 1;
    const completed = isReviewComplete(selectedReview.id);

    return (
      <div className="app-root">
        <div className="app-wrapper">
          <div className="app-card app-card--review">
            <header className="app-header">
              <div className="header-text">
                <button className="back-link" onClick={goToUnit}>
                  ← Back to {selectedUnit?.title}
                </button>
                <h1 className="app-title">{selectedReview.title}</h1>
                <p className="app-subtitle">{selectedReview.description}</p>
              </div>
            </header>

            {words.length === 0 ? (
              <div className="review-empty">
                <p>No words to review yet. Complete more lessons first!</p>
                <button className="primary-button" onClick={goToUnit}>
                  Back to Unit
                </button>
              </div>
            ) : current ? (
              <>
                {renderFlashcard(current, true)}

                {/* SRS Rating Buttons - show after card is flipped */}
                {showBack && !hasRated && (
                  <div className="rating-section">
                    <p className="rating-prompt">How well did you know this?</p>
                    <div className="rating-buttons">
                      <button
                        className="rating-btn rating-btn--again"
                        onClick={() => handleRate("again")}
                      >
                        Again
                      </button>
                      <button
                        className="rating-btn rating-btn--hard"
                        onClick={() => handleRate("hard")}
                      >
                        Hard
                      </button>
                      <button
                        className="rating-btn rating-btn--good"
                        onClick={() => handleRate("good")}
                      >
                        Good
                      </button>
                      <button
                        className="rating-btn rating-btn--easy"
                        onClick={() => handleRate("easy")}
                      >
                        Easy
                      </button>
                    </div>
                  </div>
                )}

                {hasRated && (
                  <div className="rating-confirmed">Rating saved!</div>
                )}

                <div className="nav-row">
                  <button className="primary-button" onClick={handlePrev}>
                    ← Previous
                  </button>
                  <span className="nav-counter">
                    {index + 1} / {words.length}
                  </span>
                  {isLastCard && !completed ? (
                    <button
                      className="primary-button complete-button"
                      onClick={completeReview}
                    >
                      Complete ✓
                    </button>
                  ) : (
                    <button className="primary-button" onClick={handleNext}>
                      Next →
                    </button>
                  )}
                </div>
                {completed && (
                  <div className="lesson-complete-badge">✓ Review completed</div>
                )}
              </>
            ) : (
              <p>No words available.</p>
            )}
          </div>
          <footer className="global-footer">
            © {new Date().getFullYear()} Shahrom Dehoti
          </footer>
        </div>
      </div>
    );
  }

  // QUIZ VIEW (word matching)
  if (view === "quiz" && selectedUnit) {
    const allMatched = Object.keys(quizMatches).length === quizWords.length;

    return (
      <div className="app-root">
        <div className="app-wrapper">
          <div className="app-card app-card--quiz">
            <header className="app-header">
              <div className="header-text">
                <button className="back-link" onClick={goToUnit}>
                  ← Back to {selectedUnit?.title}
                </button>
                <h1 className="app-title">Unit Quiz</h1>
                <p className="app-subtitle">
                  Match each Tajik word with its English translation
                </p>
              </div>
            </header>

            <div className="quiz-container">
              <div className="quiz-column quiz-words">
                <h3 className="quiz-column-title">Tajik</h3>
                {quizWords.map((word, idx) => {
                  const isSelected = selectedWordIdx === idx;
                  const isMatched = quizMatches[idx] !== undefined;
                  const isCorrect =
                    quizSubmitted &&
                    isMatched &&
                    quizTranslations[quizMatches[idx]] === word.english;
                  const isWrong = quizSubmitted && isMatched && !isCorrect;

                  return (
                    <button
                      key={idx}
                      className={
                        "quiz-item quiz-item--word" +
                        (isSelected ? " quiz-item--selected" : "") +
                        (isMatched ? " quiz-item--matched" : "") +
                        (isCorrect ? " quiz-item--correct" : "") +
                        (isWrong ? " quiz-item--wrong" : "")
                      }
                      onClick={() => handleQuizWordClick(idx)}
                      disabled={quizSubmitted}
                    >
                      {word.tajik}
                      {isMatched && (
                        <span className="quiz-match-num">
                          {quizMatches[idx] + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="quiz-column quiz-translations">
                <h3 className="quiz-column-title">English</h3>
                {quizTranslations.map((trans, idx) => {
                  const matchedByWord = Object.entries(quizMatches).find(
                    ([, tIdx]) => tIdx === idx
                  );
                  const isMatched = matchedByWord !== undefined;
                  const wordIdx = matchedByWord ? parseInt(matchedByWord[0]) : null;
                  const isCorrect =
                    quizSubmitted &&
                    isMatched &&
                    quizWords[wordIdx]?.english === trans;
                  const isWrong = quizSubmitted && isMatched && !isCorrect;

                  return (
                    <button
                      key={idx}
                      className={
                        "quiz-item quiz-item--translation" +
                        (isMatched ? " quiz-item--matched" : "") +
                        (isCorrect ? " quiz-item--correct" : "") +
                        (isWrong ? " quiz-item--wrong" : "")
                      }
                      onClick={() => handleQuizTranslationClick(idx)}
                      disabled={quizSubmitted}
                    >
                      {trans}
                      {isMatched && (
                        <span className="quiz-match-num">{idx + 1}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {!quizSubmitted ? (
              <div className="quiz-actions">
                <p className="quiz-hint">
                  {selectedWordIdx !== null
                    ? "Now click on the matching translation"
                    : "Click a Tajik word to start matching"}
                </p>
                <button
                  className="primary-button"
                  onClick={submitQuiz}
                  disabled={!allMatched}
                >
                  Submit Quiz
                </button>
              </div>
            ) : (
              <div className="quiz-results">
                <div
                  className={
                    "quiz-score" +
                    (quizScore === quizWords.length ? " quiz-score--perfect" : "")
                  }
                >
                  {quizScore} / {quizWords.length} correct
                </div>
                {quizScore === quizWords.length ? (
                  <>
                    <p className="quiz-message">🎉 Perfect! Unit complete!</p>
                    <button className="primary-button" onClick={goToUnit}>
                      Back to Unit
                    </button>
                  </>
                ) : (
                  <>
                    <p className="quiz-message">Keep practicing and try again!</p>
                    <button className="primary-button" onClick={openQuiz}>
                      Try Again
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <footer className="global-footer">
            © {new Date().getFullYear()} Shahrom Dehoti
          </footer>
        </div>
      </div>
    );
  }

  // PRACTICE VIEW (original category browsing)
  if (view === "practice") {
    return (
      <div className="app-root">
        <div className="app-wrapper">
          <div className="app-card">
            <header className="app-header">
              <div className="header-text">
                <button className="back-link" onClick={goHome}>
                  ← Back to Home
                </button>
                <h1 className="app-title">Practice Mode</h1>
                <p className="app-subtitle">Browse vocabulary by category.</p>
              </div>
            </header>

            {/* Category pills */}
            <div className="category-row">
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  className={
                    "category-pill" +
                    (key === category ? " category-pill--active" : "")
                  }
                  onClick={() => handleCategoryChange(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Mobile Dropdown */}
            <select
              className="category-dropdown"
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
            >
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            {current ? (
              <>
                {renderFlashcard(current)}
                <div className="nav-row">
                  <button className="primary-button" onClick={handlePrev}>
                    ← Previous
                  </button>
                  <span className="nav-counter">
                    {index + 1} / {words.length}
                  </span>
                  <button className="primary-button" onClick={handleNext}>
                    Next →
                  </button>
                </div>
              </>
            ) : (
              <p>No words in this category.</p>
            )}
          </div>
          <footer className="global-footer">
            © {new Date().getFullYear()} Shahrom Dehoti
          </footer>
        </div>
      </div>
    );
  }

  // Fallback
  return null;

  // ============ SHARED COMPONENTS ============

  function renderFlashcard(word, isReview = false) {
    return (
      <div
        className={
          "flashcard" +
          (showBack ? " flashcard--flipped" : "") +
          (isReview ? " flashcard--review" : "")
        }
        onClick={() => setShowBack((s) => !s)}
      >
        <div className="flashcard-inner">
          {/* FRONT */}
          <div className="flashcard-face flashcard-front">
            <div className="flashcard-tajik">{word.tajik}</div>
            <button
              className="audio-button"
              onClick={(e) => {
                e.stopPropagation();
                speak(word.tajik);
              }}
            >
              Pronounce
            </button>
            <div className="flashcard-pron-latin">
              {word.pronunciation_latin}
            </div>
            <div className="flashcard-pron-cyr">
              {word.pronunciation_cyrillic}
            </div>
            {!showBack && (
              <div className="flashcard-hint">Click to show translations</div>
            )}
          </div>

          {/* BACK */}
          <div className="flashcard-face flashcard-back">
            <div className="flashcard-translation">
              English: <strong>{word.english}</strong>
            </div>
            <div className="flashcard-translation">
              Russian: <strong>{word.russian}</strong>
            </div>
            <div className="flashcard-hint">
              {isReview ? "Rate your recall below" : "Click to hide translations"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderFeedbackModal() {
    if (!isFeedbackOpen) return null;
    return (
      <div className="feedback-overlay">
        <div className="feedback-modal">
          <h2 className="feedback-title">Leave Feedback</h2>
          <div className="feedback-input-wrapper">
            {!feedbackText && (
              <div className="feedback-placeholder">
                How can I improve your experience?
              </div>
            )}
            <textarea
              className="feedback-textarea"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
            />
          </div>
          <div className="feedback-buttons">
            <button
              className="feedback-cancel"
              onClick={() => {
                setFeedbackText("");
                setIsFeedbackOpen(false);
              }}
            >
              Cancel
            </button>
            <button
              className="feedback-send"
              onClick={() => {
                fetch(
                  "https://docs.google.com/forms/d/e/1FAIpQLSfWJt8ElHb8IKtoDTLpHllvTAiy_UA27cJlRwLJzdFGYMqDgw/formResponse",
                  {
                    method: "POST",
                    mode: "no-cors",
                    headers: {
                      "Content-Type":
                        "application/x-www-form-urlencoded;charset=UTF-8",
                    },
                    body: `entry.358480867=${encodeURIComponent(feedbackText)}`,
                  }
                );
                setFeedbackText("");
                setIsFeedbackOpen(false);
                setShowToast(true);
                setTimeout(() => setShowToast(false), 3000);
              }}
              disabled={!feedbackText.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default App;
