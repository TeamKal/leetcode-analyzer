// Earlier versions ran Whisper in the browser, and the model files (tens to
// hundreds of MB) were stored in Cache Storage under this key. Transcription is
// now server-side only, so remove those leftovers from visitors' browsers.
// Safe to delete once old visitors have had time to load the site.
const LEGACY_MODEL_CACHE_KEY = "transformers-cache";

export async function clearLegacyWhisperCache(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    await caches.delete(LEGACY_MODEL_CACHE_KEY);
  } catch {
    // Cache Storage can be unavailable (private mode, blocked storage).
  }
}
