/** Pure helpers for the mentor dashboard (no imports, so they are easy to test). */

export type GradingState = "waiting" | "needs_grading" | "graded" | "failed";

/** Submission statuses a mentor sees; earlier statuses are still the student's draft. */
export const MENTOR_VISIBLE_STATUSES = [
  "pending_evaluation",
  "evaluating",
  "evaluated",
  "graded",
  "failed",
] as const;

export function getGradingState(status: string): GradingState | null {
  switch (status) {
    case "pending_evaluation":
    case "evaluating":
      return "waiting";
    case "evaluated":
      return "needs_grading";
    case "graded":
      return "graded";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

export const GRADING_STATE_LABELS: Record<GradingState, string> = {
  waiting: "Waiting for AI",
  needs_grading: "Ready to grade",
  graded: "Graded",
  failed: "AI evaluation failed",
};

export type ListFilter = "needs" | "graded" | "all";

export function parseListFilter(value: unknown): ListFilter {
  return value === "graded" || value === "all" ? value : "needs";
}

export function matchesFilter(state: GradingState | null, filter: ListFilter) {
  if (state === null) return false;
  if (filter === "all") return true;
  if (filter === "graded") return state === "graded";
  return state === "needs_grading" || state === "waiting";
}

/** Parses a typed score. Returns null unless it is a number from 0 to 10 with at most 2 decimals. */
export function parseScoreInput(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) return null;
  const score = Number(text);
  return score >= 0 && score <= 10 ? score : null;
}

/** Shows a score with up to one decimal, e.g. 7 or 7.5. */
export function formatScore(value: number | string | null | undefined) {
  const score = typeof value === "string" ? Number(value) : value;
  if (typeof score !== "number" || !Number.isFinite(score)) return "–";
  return String(Math.round(score * 10) / 10);
}

export const REVIEW_FLAG_LABELS: Record<string, string> = {
  wrong_problem: "May be about a different problem",
  off_topic: "Off topic",
  possible_prompt_injection: "Possible attempt to influence the AI",
  unclear_or_garbled_transcript: "Transcript is unclear",
  transcript_too_short: "Transcript is very short",
  no_problem_statement: "Problem statement was unavailable",
  reference_unavailable: "No reference answer available",
  reference_low_confidence: "Reference answer is low confidence",
  unsupported_evidence: "Some quoted evidence could not be verified",
  score_adjusted: "A score was above its limit and was capped",
};

export function describeReviewFlag(flag: string) {
  return REVIEW_FLAG_LABELS[flag] ?? flag.replace(/_/g, " ");
}

/** Reads a jsonb column that should be a list of strings. */
export function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export type CategoryScore = {
  category: string;
  score: number;
  feedback: string;
  evidence: string[];
};

/** Reads the `scores` jsonb in the order of `categories`, skipping malformed entries. */
export function readCategoryScores(
  value: unknown,
  categories: readonly string[],
): CategoryScore[] {
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const result: CategoryScore[] = [];

  for (const category of categories) {
    const entry = record[category];
    if (typeof entry !== "object" || entry === null) continue;
    const { score, feedback, evidence } = entry as Record<string, unknown>;
    if (typeof score !== "number" || !Number.isFinite(score)) continue;
    result.push({
      category,
      score,
      feedback: typeof feedback === "string" ? feedback : "",
      evidence: readStringList(evidence),
    });
  }
  return result;
}

/** PostgREST returns a one-to-one embed as an object, but may return a list; accept both. */
export function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const GRADE_ERRORS: [RegExp, string][] = [
  [/already been graded/i, "This submission has already been graded."],
  [/AI evaluation must be completed/i, "The AI evaluation is not ready yet."],
  [/not evaluated|access denied|not found/i, "This submission cannot be graded right now."],
  [/between 0 and 10/i, "Enter a score from 0 to 10."],
  [/authentication|only admins and mentors/i, "You are not allowed to grade submissions."],
];

export function describeGradeError(message: string | undefined) {
  const match = GRADE_ERRORS.find(([pattern]) => pattern.test(message ?? ""));
  return match ? match[1] : "The grade could not be saved. Please try again.";
}

const GENERIC_FAILURES = new Set([
  "",
  "Evaluation processing failed.",
  "Unknown evaluation error",
]);

/** The reason shown to a mentor for a failed evaluation (the job's stored, sanitized reason). */
export function describeFailureReason(lastError: unknown): string {
  const text = typeof lastError === "string" ? lastError.trim() : "";
  if (GENERIC_FAILURES.has(text)) {
    return "The evaluation failed for a reason we could not identify. Trying again often fixes it.";
  }
  return text;
}
