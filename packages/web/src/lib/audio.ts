import { audioUrl } from "./supabase.js";

/**
 * Pronounce a word.
 *
 * Prefers a real recording from storage. When none exists — or playback is
 * refused, which browsers do when audio is triggered without a user gesture —
 * it falls back to speech synthesis.
 *
 * The fallback uses a **Russian** voice deliberately: no browser ships a Tajik
 * voice, and Tajik is written in Cyrillic with largely overlapping phonology,
 * so a Russian voice is a far closer approximation than the default English
 * one. It is still an approximation, which is why recorded audio wins whenever
 * it exists.
 */
export async function speak(text: string, audioPath: string | null): Promise<void> {
  const url = audioUrl(audioPath);

  if (url !== null) {
    try {
      await new Audio(url).play();
      return;
    } catch {
      // Autoplay blocked, file missing, or codec unsupported — fall through.
    }
  }

  speakWithSynthesis(text);
}

function speakWithSynthesis(text: string): void {
  const synthesis = globalThis.speechSynthesis as SpeechSynthesis | undefined;
  if (synthesis === undefined) return;

  const utterance = new SpeechSynthesisUtterance(text);
  const russianVoice = synthesis.getVoices().find((voice) => voice.lang.startsWith("ru"));
  if (russianVoice !== undefined) utterance.voice = russianVoice;
  utterance.rate = 0.8;

  synthesis.speak(utterance);
}
