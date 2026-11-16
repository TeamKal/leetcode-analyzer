// Pure helpers for detecting and repairing looping ASR output.

const MAX_PHRASE_WORDS = 6;
const LOOP_REPEATS = 4;
const MAX_WORDS_PER_SECOND = 7;

function normalizeWord(word: string) {
  return word.toLowerCase().replace(/[^a-z0-9']/g, "");
}

// Collapses a phrase (1-6 words) repeated 4+ times in a row down to one copy.
export function collapseRepeats(text: string): string {
  let words = text.split(/\s+/).filter(Boolean);
  let changed = true;
  while (changed) {
    changed = false;
    for (let size = 1; size <= MAX_PHRASE_WORDS && !changed; size += 1) {
      for (let start = 0; start + size * LOOP_REPEATS <= words.length; start += 1) {
        const phrase = words.slice(start, start + size).map(normalizeWord);
        if (phrase.every((word) => word === "")) continue;
        let repeats = 1;
        while (
          start + (repeats + 1) * size <= words.length &&
          words
            .slice(start + repeats * size, start + (repeats + 1) * size)
            .map(normalizeWord)
            .every((word, index) => word === phrase[index])
        ) {
          repeats += 1;
        }
        if (repeats >= LOOP_REPEATS) {
          words = [
            ...words.slice(0, start + size),
            ...words.slice(start + repeats * size),
          ];
          changed = true;
          break;
        }
      }
    }
  }
  return words.join(" ");
}

// True when output looks like a decoder loop or is implausibly dense.
export function isDegenerateTranscript(
  text: string,
  speechSeconds: number,
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (collapseRepeats(trimmed) !== trimmed.split(/\s+/).join(" ")) return true;
  const wordCount = trimmed.split(/\s+/).length;
  return speechSeconds >= 1 && wordCount / speechSeconds > MAX_WORDS_PER_SECOND;
}
