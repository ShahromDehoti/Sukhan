import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://bmijudbriacxzzvnqazc.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtaWp1ZGJyaWFjeHp6dm5xYXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTUzMjEsImV4cCI6MjA4NDQzMTMyMX0.TMSx76dVouorT0fMlLTZl4KeFHmxExoBCL25M18g3Gg";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Fetch all words from Supabase, grouped by category
 */
export async function fetchWords() {
  const { data, error } = await supabase
    .from("words")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("Error fetching words:", error);
    return null;
  }

  // Group words by category
  const grouped = {};
  for (const word of data) {
    if (!grouped[word.category]) {
      grouped[word.category] = [];
    }
    grouped[word.category].push(word);
  }

  return grouped;
}

/**
 * Fetch the full curriculum (units with lessons and words)
 */
export async function fetchCurriculum() {
  // Fetch units
  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("*")
    .order("sort_order", { ascending: true });

  if (unitsError) {
    console.error("Error fetching units:", unitsError);
    return null;
  }

  // Fetch lessons
  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("*")
    .order("sort_order", { ascending: true });

  if (lessonsError) {
    console.error("Error fetching lessons:", lessonsError);
    return null;
  }

  // Fetch lesson_words with word data joined
  const { data: lessonWords, error: lessonWordsError } = await supabase
    .from("lesson_words")
    .select(`
      lesson_id,
      sort_order,
      words (*)
    `)
    .order("sort_order", { ascending: true });

  if (lessonWordsError) {
    console.error("Error fetching lesson_words:", lessonWordsError);
    return null;
  }

  // Group lesson_words by lesson_id
  const wordsByLesson = {};
  for (const lw of lessonWords) {
    if (!wordsByLesson[lw.lesson_id]) {
      wordsByLesson[lw.lesson_id] = [];
    }
    if (lw.words) {
      wordsByLesson[lw.lesson_id].push(lw.words);
    }
  }

  // Build the curriculum structure
  const curriculum = units.map((unit) => ({
    id: `unit-${unit.id}`,
    dbId: unit.id,
    title: unit.title,
    description: unit.description,
    lessons: lessons
      .filter((lesson) => lesson.unit_id === unit.id)
      .map((lesson) => ({
        id: `lesson-${lesson.id}`,
        dbId: lesson.id,
        title: lesson.title,
        description: lesson.description,
        words: wordsByLesson[lesson.id] || [],
      })),
  }));

  return curriculum;
}

/**
 * Get the public URL for an audio file in Supabase Storage
 * @param {string} path - Path to the audio file in the 'audio' bucket
 */
export function getAudioUrl(path) {
  if (!path) return null;
  const { data } = supabase.storage.from("audio").getPublicUrl(path);
  return data?.publicUrl || null;
}
