import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    // No accounts yet. Progress lives in localStorage until the API service and
    // auth land, at which point this becomes a real session.
    persistSession: false,
    autoRefreshToken: false,
  },
});

/** Public URL for a file in the `audio` storage bucket. */
export function audioUrl(path: string | null): string | null {
  if (path === null || path === "") return null;
  const { data } = supabase.storage.from("audio").getPublicUrl(path);
  return data.publicUrl || null;
}
