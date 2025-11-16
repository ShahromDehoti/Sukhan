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

  return (
    <div className="app-root">
      <div className="app-card">
        {/* Header */}
        <header className="app-header">
          <div>
            <h1 className="app-title">Flashcards</h1>
            <p className="app-subtitle">
              Practice Tajik with English & Russian translations.
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

        {/* Flashcard */}
        <div
          className={"flashcard" + (showBack ? " flashcard--flipped" : "")}
          onClick={() => setShowBack((s) => !s)}
        >
          <div className="flashcard-inner">
            {/* FRONT */}
            <div className="flashcard-face flashcard-front">
              <div className="flashcard-tajik">{current.tajik}</div>

                <div className="flashcard-pron-latin">
                  {current.pronunciation_latin}
                </div>

                <div className="flashcard-pron-cyr">
                  {current.pronunciation_cyrillic}
                </div>

              {!showBack && (
                <div className="flashcard-hint">
                  Click to show translations
                </div>
              )}
            </div>

            {/* BACK */}
            <div className="flashcard-face flashcard-back">
            <div className="flashcard-translation">
              English: <strong>{current.english}</strong>
            </div>

            <div className="flashcard-translation">
              Russian: <strong>{current.russian}</strong>
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

          <span className="nav-counter">
            {index + 1} / {words.length}
          </span>

          <button className="primary-button" onClick={handleNext}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
