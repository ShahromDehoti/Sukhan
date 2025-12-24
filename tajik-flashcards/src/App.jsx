// src/App.jsx
import { useState, useMemo } from "react";
import dictionary from "./data/dictionary.json";
import curriculum from "./data/curriculum.json";
import {
  isLessonComplete,
  isLessonUnlocked,
  markLessonComplete,
  getUnitProgress,
} from "./utils/progress";
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
  adjectives: "Adjectives"
};

// Resolve word references from curriculum to actual word objects
function resolveWords(wordRefs) {
  return wordRefs
    .map((ref) => {
      const categoryWords = dictionary[ref.category];
      if (!categoryWords) return null;
      return categoryWords[ref.index] || null;
    })
    .filter(Boolean);
}

function App() {
  // View: "home" | "unit" | "lesson" | "practice"
  const [view, setView] = useState("home");
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);

  // Flashcard state (shared between lesson and practice modes)
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);

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
    if (view === "practice") {
      return dictionary[category] || [];
    }
    return [];
  }, [view, selectedLesson, category]);

  const current = words[index] || null;

  // Navigation handlers
  const handleNext = () => {
    if (!words.length) return;
    setShowBack(false);
    setIndex((prev) => (prev + 1) % words.length);
  };

  const handlePrev = () => {
    if (!words.length) return;
    setShowBack(false);
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
    setIndex(0);
    setShowBack(false);
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

  const openPractice = () => {
    setCategory("greetings");
    setIndex(0);
    setShowBack(false);
    setView("practice");
  };

  const completeLesson = () => {
    if (selectedLesson) {
      markLessonComplete(selectedLesson.id);
      setProgressTick((t) => t + 1); // Force re-render
    }
    setView("unit");
    setSelectedLesson(null);
    setIndex(0);
    setShowBack(false);
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
                Structured lessons to build your vocabulary step by step.
              </p>
              <div className="unit-grid">
                {curriculum.units.map((unit) => {
                  const completed = getUnitProgress(unit.lessons);
                  const total = unit.lessons.length;
                  return (
                    <button
                      key={unit.id}
                      className="unit-card"
                      onClick={() => openUnit(unit)}
                    >
                      <div className="unit-card-title">{unit.title}</div>
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

  // UNIT VIEW (lesson list)
  if (view === "unit" && selectedUnit) {
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

            <div className="lesson-list">
              {selectedUnit.lessons.map((lesson, idx) => {
                const unlocked = isLessonUnlocked(
                  lesson.id,
                  selectedUnit.lessons
                );
                const completed = isLessonComplete(lesson.id);
                return (
                  <button
                    key={lesson.id}
                    className={
                      "lesson-card" +
                      (completed ? " lesson-card--completed" : "") +
                      (!unlocked ? " lesson-card--locked" : "")
                    }
                    onClick={() => unlocked && openLesson(lesson)}
                    disabled={!unlocked}
                  >
                    <div className="lesson-card-number">{idx + 1}</div>
                    <div className="lesson-card-content">
                      <div className="lesson-card-title">{lesson.title}</div>
                      <div className="lesson-card-desc">{lesson.description}</div>
                      <div className="lesson-card-words">
                        {lesson.words.length} words
                      </div>
                    </div>
                    <div className="lesson-card-status">
                      {completed && <span className="status-check">✓</span>}
                      {!unlocked && <span className="status-lock">🔒</span>}
                    </div>
                  </button>
                );
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
                <button
                  className="back-link"
                  onClick={() => {
                    setView("unit");
                    setSelectedLesson(null);
                  }}
                >
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
                  <div className="lesson-complete-badge">
                    ✓ Lesson completed
                  </div>
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
                <p className="app-subtitle">
                  Browse vocabulary by category.
                </p>
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

  function renderFlashcard(word) {
    return (
      <div
        className={"flashcard" + (showBack ? " flashcard--flipped" : "")}
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
            <div className="flashcard-hint">Click to hide translations</div>
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
