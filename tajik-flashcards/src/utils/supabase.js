import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://bmijudbriacxzzvnqazc.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtaWp1ZGJyaWFjeHp6dm5xYXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTUzMjEsImV4cCI6MjA4NDQzMTMyMX0.TMSx76dVouorT0fMlLTZl4KeFHmxExoBCL25M18g3Gg";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Fetch all words from Supabase and group them by category
 * Returns the same structure as dictionary.json: { category: [words] }
 */
export async function fetchWordsFromSupabase() {
  const { data, error } = await supabase
    .from("words")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("Error fetching words from Supabase:", error);
    return null;
  }

  // Group words by category (same structure as dictionary.json)
  const grouped = {};
  for (const word of data) {
    if (!grouped[word.category]) {
      grouped[word.category] = [];
    }
    // Remove the category field from individual words to match JSON structure
    const { category, id, created_at, ...wordData } = word;
    grouped[category].push(wordData);
  }

  return grouped;
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
