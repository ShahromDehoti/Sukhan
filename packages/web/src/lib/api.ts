/**
 * The data boundary.
 *
 * Everything that knows the database uses snake_case column names lives here.
 * Past this module, the application deals only in `@sukhan/core` domain types,
 * so a column rename is a change to one mapper rather than a change everywhere.
 *
 * ## Three fixes from the original
 *
 * 1. **One round trip, not three.** `fetchCurriculum` issued separate queries
 *    for units, lessons, and `lesson_words`, pulled *every* lesson_word row in
 *    the database regardless of which unit was wanted, and stitched the tree
 *    together in JavaScript. PostgREST can express the whole nested shape in a
 *    single request.
 *
 * 2. **Word ordering actually works.** The original called
 *    `.order("sort_order")` on the `lesson_words` query, which ordered the outer
 *    result rows rather than the words within each lesson — so a lesson's words
 *    came back in whatever order Postgres felt like. Ordering is now applied per
 *    level and re-asserted client-side.
 *
 * 3. **Failures propagate.** Errors were logged to the console and `null` was
 *    returned, which the UI rendered as an empty screen with no message. These
 *    functions throw, so React Query can surface a real error state and retry.
 */

import type { Unit, Word } from "@sukhan/core";
import { audioUrl, supabase } from "./supabase.js";

// ---------------------------------------------------------------------------
// Database row shapes
// ---------------------------------------------------------------------------

interface WordRow {
  id: number;
  category: string | null;
  tajik: string | null;
  english: string | null;
  russian: string | null;
  pronunciation_latin: string | null;
  pronunciation_cyrillic: string | null;
  audio_url: string | null;
}

interface LessonWordRow {
  sort_order: number | null;
  words: WordRow | null;
}

interface LessonRow {
  id: number;
  title: string | null;
  description: string | null;
  sort_order: number | null;
  lesson_words: LessonWordRow[] | null;
}

interface UnitRow {
  id: number;
  title: string | null;
  description: string | null;
  sort_order: number | null;
  lessons: LessonRow[] | null;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toWord(row: WordRow): Word {
  return {
    id: row.id,
    tajik: row.tajik ?? "",
    english: row.english ?? "",
    russian: row.russian ?? "",
    pronunciationLatin: row.pronunciation_latin ?? "",
    pronunciationCyrillic: row.pronunciation_cyrillic ?? "",
    category: row.category ?? "uncategorised",
    audioPath: row.audio_url,
  };
}

/** Ascending by `sort_order`, with rows missing one sorted last by id. */
function bySortOrder<T extends { sort_order: number | null; id?: number }>(a: T, b: T): number {
  const left = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const right = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return (a.id ?? 0) - (b.id ?? 0);
}

function toUnit(row: UnitRow): Unit {
  const lessons = [...(row.lessons ?? [])].sort(bySortOrder).map((lesson) => {
    const words = [...(lesson.lesson_words ?? [])]
      .sort(bySortOrder)
      .map((entry) => entry.words)
      .filter((word): word is WordRow => word !== null)
      .map(toWord);

    return {
      // Preserved from the original so existing progress keys keep resolving.
      id: `lesson-${lesson.id}`,
      title: lesson.title ?? "Untitled lesson",
      description: lesson.description ?? "",
      words,
    };
  });

  return {
    id: `unit-${row.id}`,
    title: row.title ?? "Untitled unit",
    description: row.description ?? "",
    lessons,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Human-readable labels for the practice categories. */
export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
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

const CURRICULUM_SELECT = `
  id, title, description, sort_order,
  lessons (
    id, title, description, sort_order,
    lesson_words (
      sort_order,
      words ( id, category, tajik, english, russian, pronunciation_latin, pronunciation_cyrillic, audio_url )
    )
  )
` as const;

export async function fetchCurriculum(): Promise<Unit[]> {
  const { data, error } = await supabase
    .from("units")
    .select(CURRICULUM_SELECT)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load curriculum: ${error.message}`, { cause: error });
  }

  return ((data ?? []) as unknown as UnitRow[]).sort(bySortOrder).map(toUnit);
}

/** Every word, grouped by category, for the free-browsing practice mode. */
export async function fetchWordsByCategory(): Promise<Record<string, Word[]>> {
  const { data, error } = await supabase
    .from("words")
    .select("id, category, tajik, english, russian, pronunciation_latin, pronunciation_cyrillic, audio_url")
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Failed to load words: ${error.message}`, { cause: error });
  }

  const grouped: Record<string, Word[]> = {};
  for (const row of (data ?? []) as unknown as WordRow[]) {
    const word = toWord(row);
    (grouped[word.category] ??= []).push(word);
  }
  return grouped;
}

export { audioUrl };
