import type { Word } from "@sukhan/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Flashcard } from "./Flashcard.js";

vi.mock("../lib/audio.js", () => ({ speak: vi.fn(() => Promise.resolve()) }));

const WORD: Word = {
  id: 1,
  tajik: "салом",
  english: "hello",
  russian: "привет",
  pronunciationLatin: "salom",
  pronunciationCyrillic: "салём",
  category: "greetings",
  audioPath: null,
};

/** Wrapper that owns flip state, so interaction can be driven end to end. */
function Harness(): React.JSX.Element {
  const [isFlipped, setFlipped] = useState(false);
  return (
    <Flashcard
      word={WORD}
      isFlipped={isFlipped}
      onFlip={() => {
        setFlipped((flipped) => !flipped);
      }}
      pronunciation="both"
    />
  );
}

describe("Flashcard accessibility", () => {
  /**
   * These assertions are the regression test for the original's central defect:
   * the card was a `<div onClick>`, so revealing a translation — the app's whole
   * purpose — was impossible without a mouse.
   */
  it("exposes the card as a toggle button", () => {
    render(<Harness />);
    const card = screen.getByRole("button", { pressed: false });
    expect(card).toBeInTheDocument();
  });

  it("flips with the keyboard alone", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // Tab reaches it, which a div never would have.
    await user.tab();
    const card = screen.getByRole("button", { pressed: false });
    expect(card).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { pressed: true })).toBeInTheDocument();

    await user.keyboard(" ");
    expect(screen.getByRole("button", { pressed: false })).toBeInTheDocument();
  });

  it("flips on click as well", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { pressed: false }));
    expect(screen.getByRole("button", { pressed: true })).toBeInTheDocument();
  });

  it("gives the audio control a meaningful name", () => {
    render(<Harness />);
    // Not "button", and not the emoji read aloud.
    expect(
      screen.getByRole("button", { name: /play pronunciation of салом/i }),
    ).toBeInTheDocument();
  });

  it("does not nest the audio button inside the flip button", () => {
    // Nested interactive elements are invalid HTML and resolve unpredictably;
    // the original relied on stopPropagation to work around it.
    render(<Harness />);
    const audio = screen.getByRole("button", { name: /play pronunciation/i });
    expect(audio.closest("button")).toBe(audio);
  });

  it("announces the revealed translation in a live region", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    const live = container.querySelector("[aria-live='polite']");
    expect(live).toHaveTextContent("");

    await user.click(screen.getByRole("button", { pressed: false }));
    // A CSS transform alone announces nothing; the text has to actually change.
    expect(live).toHaveTextContent("English: hello");
    expect(live).toHaveTextContent("Russian: привет");
  });

  it("tags each script with its language for correct pronunciation", () => {
    render(<Harness />);
    expect(screen.getByText("салом")).toHaveAttribute("lang", "tg");
    expect(screen.getByText("hello")).toHaveAttribute("lang", "en");
    expect(screen.getByText("привет")).toHaveAttribute("lang", "ru");
  });
});

describe("Flashcard pronunciation settings", () => {
  function renderWith(mode: "both" | "latin" | "cyrillic" | "none"): void {
    render(
      <Flashcard word={WORD} isFlipped={false} onFlip={() => undefined} pronunciation={mode} />,
    );
  }

  it.each([
    ["both", true, true],
    ["latin", true, false],
    ["cyrillic", false, true],
    ["none", false, false],
  ] as const)("shows the right guides for %s", (mode, latin, cyrillic) => {
    renderWith(mode);
    expect(screen.queryByText("salom") !== null).toBe(latin);
    expect(screen.queryByText("салём") !== null).toBe(cyrillic);
  });
});
