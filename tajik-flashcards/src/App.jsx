// src/App.jsx
import { useState, useMemo } from "react";
import data from "./data/dictionary.json";

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
    // Simple copy so we can shuffle if we want later
    return [...arr];
  }, [category]);

  const current = words[index] || null;

  const handleNext = () => {
    setShowBack(false);
    setIndex((prev) => (prev + 1) % words.length);
  };

  const handlePrev = () => {
    setShowBack(false);
    setIndex((prev) =>
      prev === 0 ? words.length - 1 : prev - 1
    );
  };

  const handleCategoryChange = (e) => {
    setCategory(e.target.value);
    setIndex(0);
    setShowBack(false);
  };

  const shuffleWords = () => {
    // Very basic shuffle: randomize index only (keeps JSON static)
    const randomIndex = Math.floor(Math.random() * words.length);
    setIndex(randomIndex);
    setShowBack(false);
  };

  if (!current) {
    return <div style={{ padding: 24 }}>No words in this category.</div>;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont",
        background: "#f5f5f7",
        padding: "24px"
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Tajik Flashcards</h1>
      <p style={{ marginBottom: 24, color: "#555" }}>
        Practice Tajik vocabulary with English & Russian translations.
      </p>

      {/* Top controls */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "24px",
          alignItems: "center"
        }}
      >
        <label>
          Category:{" "}
          <select value={category} onChange={handleCategoryChange}>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <button onClick={shuffleWords}>Shuffle</button>

        <label style={{ marginLeft: "auto" }}>
          <input
            type="checkbox"
            checked={showLatin}
            onChange={() => setShowLatin((v) => !v)}
          />
          {" "}Show Latin
        </label>
        <label>
          <input
            type="checkbox"
            checked={showCyrillic}
            onChange={() => setShowCyrillic((v) => !v)}
          />
          {" "}Show Cyrillic
        </label>
      </div>

      {/* Flashcard */}
      <div
        onClick={() => setShowBack((s) => !s)}
        style={{
          maxWidth: 480,
          margin: "0 auto 24px",
          padding: "32px 24px",
          borderRadius: "16px",
          background: "white",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          cursor: "pointer",
          textAlign: "center",
          transition: "transform 0.15s ease",
        }}
      >
        <div style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>
          {CATEGORY_LABELS[category]} — {index + 1} / {words.length}
        </div>

        {/* Front: Tajik */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{current.tajik}</div>

          {showLatin && (
            <div style={{ fontSize: 16, color: "#444" }}>
              {current.pronunciation_latin}
            </div>
          )}
          {showCyrillic && (
            <div style={{ fontSize: 14, color: "#777", marginTop: 4 }}>
              {current.pronunciation_cyrillic}
            </div>
          )}
        </div>

        {/* Back: translations */}
        {showBack ? (
          <div>
            <div style={{ marginBottom: 4 }}>
              <strong>English:</strong> {current.english}
            </div>
            <div>
              <strong>Russian:</strong> {current.russian}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: "#999" }}>
              (Tap to flip back)
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#999" }}>
            Tap to show translations
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "12px"
        }}
      >
        <button onClick={handlePrev}>Previous</button>
        <button onClick={handleNext}>Next</button>
      </div>
    </div>
  );
}

export default App;
