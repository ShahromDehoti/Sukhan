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
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [showToast, setShowToast] = useState(false);


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
      <div className="app-wrapper">
        <div className="app-card">
          {/* Header */}
          <header className="app-header">
            <div className="header-text">
              <h1 className="app-title">Sukhan</h1>
              <p className="app-subtitle">
                Practice Tajik with English & Russian translations through flash cards.
              </p>
            </div>
              <button
                className="ghost-button"
                onClick={() => setIsFeedbackOpen(true)}
              >
                Leave Feedback
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
          
          {/* Mobile Dropdown */}
          <select
            className="category-dropdown"
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
          >
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          {/* Flashcard */}
          <div
            className={"flashcard" + (showBack ? " flashcard--flipped" : "")}
            onClick={() => setShowBack((s) => !s)}
          >
            <div className="flashcard-inner">
              {/* FRONT */}
              <div className="flashcard-face flashcard-front">
                <div className="flashcard-tajik">{current.tajik}</div>
                {/* Pronounce button */}
                <button className="audio-button" onClick={(e) => {
                  e.stopPropagation();
                  speak(current.tajik)}}>
                  Pronounce
                </button>

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

          {/* Feedback modal */}
          {isFeedbackOpen && (
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
                      fetch("https://docs.google.com/forms/d/e/1FAIpQLSfWJt8ElHb8IKtoDTLpHllvTAiy_UA27cJlRwLJzdFGYMqDgw/formResponse", {
                        method: "POST",
                        mode: "no-cors",
                        headers: {
                          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
                        },
                        body: `entry.358480867=${encodeURIComponent(feedbackText)}`
                      });
                    
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
          )}
          {showToast && (
            <div className="toast">
              Feedback sent! Thank you 🙌
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

export default App;
