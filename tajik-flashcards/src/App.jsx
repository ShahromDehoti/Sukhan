// src/App.jsx
import { useState, useMemo } from "react";
import data from "./data/dictionary.json";
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

function App() {
  const [category, setCategory] = useState("greetings");
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [showLatin, setShowLatin] = useState(true);
  const [showCyrillic, setShowCyrillic] = useState(true);

  const words = useMemo(() => {
    const arr = data[category] || [];
    return [...arr];
  }, [category]);

  const current = words[index] || null;

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

  const shuffleOne = () => {
    if (!words.length) return;
    const randomIndex = Math.floor(Math.random() * words.length);
    setIndex(randomIndex);
    setShowBack(false);
  };

  if (!current) {
    return (
      <div className="app-root">
        <div className="app-card">
          <h1 className="app-title">Tajik Flashcards</h1>
          <p>No words in this category yet.</p>
        </div>
      </div>
    );
  }

  const progress = ((index + 1) / words.length) * 100;

  return (
    <div className="app-root">
      <div className="app-card">
        {/* Header */}
        <header className="app-header">
          <div>
            <h1 className="app-title">Tajik Flashcards</h1>
            <p className="app-subtitle">
              Practice Tajik with English & Russian translations.
            </p>
          </div>
          <button className="ghost-button" onClick={shuffleOne}>
            🎲 Random
          </button>
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

        {/* Progress */}
        <div className="progress-row">
          <span className="progress-text">
            {CATEGORY_LABELS[category]} · {index + 1} / {words.length}
          </span>
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="toggle-row">
          <label className="toggle-item">
            <input
              type="checkbox"
              checked={showLatin}
              onChange={() => setShowLatin((v) => !v)}
            />
            <span>Latin pronunciation</span>
          </label>
          <label className="toggle-item">
            <input
              type="checkbox"
              checked={showCyrillic}
              onChange={() => setShowCyrillic((v) => !v)}
            />
            <span>Cyrillic pronunciation</span>
          </label>
        </div>

        {/* Flashcard */}
        <div
          className={"flashcard" + (showBack ? " flashcard--flipped" : "")}
          onClick={() => setShowBack((s) => !s)}
        >
          <div className="flashcard-inner">
            {/* FRONT */}
            <div className="flashcard-face flashcard-front">
              <div className="flashcard-tajik">{current.tajik}</div>

              {showLatin && (
                <div className="flashcard-pron-latin">
                  {current.pronunciation_latin}
                </div>
              )}

              {showCyrillic && (
                <div className="flashcard-pron-cyr">
                  {current.pronunciation_cyrillic}
                </div>
              )}

              {!showBack && (
                <div className="flashcard-hint">
                  Click to show translations
                </div>
              )}
            </div>

            {/* BACK */}
            <div className="flashcard-face flashcard-back">
              <div className="flashcard-translation">
                <span className="label">English</span>
                <span>{current.english}</span>
              </div>
              <div className="flashcard-translation">
                <span className="label">Russian</span>
                <span>{current.russian}</span>
              </div>
              <div className="flashcard-hint">
                Click to hide translations
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="nav-row">
          <button className="primary-button" onClick={handlePrev}>
            ← Previous
          </button>
          <button className="primary-button" onClick={handleNext}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
