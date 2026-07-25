import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
// Base layer first, then feature styles, so App.css can override the tokens.
import "./index.css";
import "./App.css";
import { migrateLegacyCards } from "./lib/storage.js";

// Seed FSRS cards from the pre-FSRS storage format, once, before first paint.
// Cheap, synchronous, and a no-op after the first run.
migrateLegacyCards();

const container = document.getElementById("root");
if (container === null) {
  throw new Error('Root element #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
