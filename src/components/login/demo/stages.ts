/**
 * Content and pure helpers for the sign-in page's product demo. No imports and
 * no DOM, so the labels, the label glitch and the rubric can be tested.
 *
 * The stages follow the real flow: a student picks a problem, records an
 * explanation with the camera, the server turns the audio into a transcript
 * (which only the mentor can read), the AI scores it against the rubric, and
 * the student sees the AI score and then the mentor's final grade.
 */

/*
 * Stage accents come from the sign-in panel's own colours: lilac and violet
 * (the waves and the mascot), the brand red, and the pale rose of the top
 * waves, plus a periwinkle between lilac and blue. One family, five tints.
 */
export const STAGES = [
  { id: "submission", label: "Submission", accent: "#cfc5fa" },
  { id: "recording", label: "Recording", accent: "#ff6b66" },
  { id: "transcription", label: "Transcription", accent: "#8fa6ff" },
  { id: "analysis", label: "Analysis", accent: "#a999e8" },
  { id: "feedback", label: "Feedback", accent: "#f7b4b0" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const stageIndex = (id: StageId) =>
  STAGES.findIndex((stage) => stage.id === id);

export const stageOf = (id: StageId) => STAGES[stageIndex(id)];

/** The evaluator's rubric: same categories and maximums as the real scoring. */
export const RUBRIC = [
  {
    key: "problem_understanding",
    label: "Problem understanding",
    score: 2,
    max: 2,
    note: "You restated the goal and the input and output clearly.",
  },
  {
    key: "approach",
    label: "Approach",
    score: 2,
    max: 2,
    note: "Clear hash map approach: store each index, then look up the complement.",
  },
  {
    key: "reasoning",
    label: "Reasoning",
    score: 1.5,
    max: 2,
    note: "Good flow. Say why one pass over the array is enough.",
  },
  {
    key: "edge_cases",
    label: "Edge cases",
    score: 0.5,
    max: 1,
    note: "Mention duplicates, like [3, 3] with target 6, and how they are handled.",
  },
  {
    key: "complexity",
    label: "Complexity",
    score: 1,
    max: 1,
    note: "Linear time is right. Add the extra space the map uses.",
  },
  {
    key: "communication",
    label: "Communication",
    score: 1.5,
    max: 2,
    note: "Easy to follow, with a steady pace.",
  },
] as const;

export const AI_TOTAL = RUBRIC.reduce((sum, row) => sum + row.score, 0);

/** The mentor's final grade in the demo (the mentor's grade is the final one). */
export const MENTOR_GRADE = 9;

export const RECORDING_SECONDS = 42;

/** 42 -> "00:42". */
export function formatClock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const GLYPHS = "01<>/|#$%&*+=?";

// A cheap deterministic hash, so the glitch looks random but never flickers
// differently between renders of the same frame.
function hash(a: number, b: number) {
  let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The workflow label while it changes: the old word breaks up into symbols and
 * the new word resolves from left to right. p = 0 is `from`, p = 1 is `to`.
 */
export function mixLabel(from: string, to: string, p: number) {
  if (p <= 0) return from;
  if (p >= 1) return to;

  const length = Math.max(from.length, to.length);
  const step = Math.floor(p * 14);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const reveal = 0.4 + 0.5 * (i / Math.max(1, length - 1));
    const glyph = GLYPHS[hash(i, step) % GLYPHS.length];
    if (p >= reveal) {
      out += to[i] ?? "";
    } else if (p < 0.25) {
      // Breaking up: some of the old letters turn into symbols.
      out += hash(i, step) % 4 === 0 ? glyph : (from[i] ?? "");
    } else {
      out += glyph;
    }
  }
  return out.trimEnd();
}
