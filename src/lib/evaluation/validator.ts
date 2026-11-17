export const EVALUATION_RUBRIC = {
  problem_understanding: 2,
  approach: 2,
  reasoning: 2,
  edge_cases: 1,
  complexity: 1,
  communication: 2,
} as const;

export type EvaluationCategory = keyof typeof EVALUATION_RUBRIC;

// Flags the model may raise.
export const MODEL_REVIEW_FLAGS = [
  "wrong_problem",
  "off_topic",
  "possible_prompt_injection",
  "unclear_or_garbled_transcript",
] as const;

// Flags only the backend raises, from facts it can verify itself.
export const BACKEND_REVIEW_FLAGS = [
  "transcript_too_short",
  "no_problem_statement",
  "reference_unavailable",
  "reference_low_confidence",
  "unsupported_evidence",
  "score_adjusted",
] as const;

export type ReviewFlag =
  | (typeof MODEL_REVIEW_FLAGS)[number]
  | (typeof BACKEND_REVIEW_FLAGS)[number];

export type EvaluationScore = {
  score: number;
  feedback: string;
  // Verbatim transcript quotes; unverifiable quotes are dropped.
  evidence: string[];
};

export type ValidatedEvaluation = {
  scores: Record<EvaluationCategory, EvaluationScore>;
  feedback: string;
  strengths: string[];
  improvements: string[];
  reviewFlags: ReviewFlag[];
  overallScore: number;
};

const CATEGORIES = Object.keys(EVALUATION_RUBRIC) as EvaluationCategory[];
const RESPONSE_KEYS = [
  "scores",
  "feedback",
  "strengths",
  "improvements",
  "review_flags",
];
const SCORE_KEYS = ["score", "feedback", "evidence"];

const MAX_EVIDENCE_ITEMS = 3;
const MAX_EVIDENCE_CHARS = 300;
const MIN_TRANSCRIPT_WORDS = 25;

function categorySchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      // No maximum here on purpose: the provider rejects the whole answer when a
      // strict schema is violated, and models sometimes exceed a small maximum.
      // The validator caps each score at its rubric maximum instead.
      score: { type: "number", minimum: 0 },
      feedback: { type: "string", minLength: 1 },
      // Length limits are enforced by the validator, not the schema: a strict
      // schema violation fails the whole request, while the validator can just
      // drop an over-long or extra quote.
      evidence: { type: "array", items: { type: "string" } },
    },
    required: SCORE_KEYS,
  } as const;
}

export const EVALUATION_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      properties: {
        problem_understanding: categorySchema(),
        approach: categorySchema(),
        reasoning: categorySchema(),
        edge_cases: categorySchema(),
        complexity: categorySchema(),
        communication: categorySchema(),
      },
      required: CATEGORIES,
    },
    feedback: { type: "string", minLength: 1 },
    strengths: { type: "array", items: { type: "string", minLength: 1 } },
    improvements: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    review_flags: {
      type: "array",
      items: { type: "string", enum: [...MODEL_REVIEW_FLAGS] },
    },
  },
  required: RESPONSE_KEYS,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length && expected.every((key) => key in value)
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => nonEmptyString(item))) {
    throw new Error(`Invalid evaluation ${field}.`);
  }
  return value.map((item: string) => item.trim());
}

function normalizeForMatch(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Keeps only quotes that appear verbatim (ignoring case and punctuation) in the
// transcript, matched on whole words. Blank, over-long, unmatched and surplus
// quotes are dropped and counted rather than failing the evaluation.
function verifyEvidence(
  quotes: string[],
  paddedTranscript: string,
): { verified: string[]; dropped: number } {
  const verified: string[] = [];
  let dropped = 0;
  for (const quote of quotes) {
    const normalized = normalizeForMatch(quote);
    if (
      quote.length <= MAX_EVIDENCE_CHARS &&
      normalized &&
      verified.length < MAX_EVIDENCE_ITEMS &&
      paddedTranscript.includes(` ${normalized} `)
    ) {
      verified.push(quote.trim());
    } else {
      dropped += 1;
    }
  }
  return { verified, dropped };
}

export function validateEvaluationResponse(
  value: unknown,
  transcript: string,
): ValidatedEvaluation {
  if (!isRecord(value) || !hasExactKeys(value, RESPONSE_KEYS)) {
    throw new Error("Invalid evaluation response shape.");
  }

  if (!isRecord(value.scores) || !hasExactKeys(value.scores, CATEGORIES)) {
    throw new Error("Invalid evaluation score categories.");
  }

  const paddedTranscript = ` ${normalizeForMatch(transcript)} `;
  const scores = {} as Record<EvaluationCategory, EvaluationScore>;
  let overallScore = 0;
  let droppedEvidence = 0;
  let adjustedScores = false;
  for (const category of CATEGORIES) {
    const categoryValue = value.scores[category];
    if (!isRecord(categoryValue) || !hasExactKeys(categoryValue, SCORE_KEYS)) {
      throw new Error(`Invalid ${category} evaluation.`);
    }

    const rawScore = categoryValue.score;
    if (
      typeof rawScore !== "number" ||
      !Number.isFinite(rawScore) ||
      rawScore < 0
    ) {
      throw new Error(`Invalid ${category} score.`);
    }
    // A score above the rubric maximum is capped, and the mentor is told.
    const score = Math.min(rawScore, EVALUATION_RUBRIC[category]);
    if (score !== rawScore) adjustedScores = true;
    if (!nonEmptyString(categoryValue.feedback)) {
      throw new Error(`Invalid ${category} feedback.`);
    }

    const evidence = categoryValue.evidence;
    if (
      !Array.isArray(evidence) ||
      !evidence.every((quote) => typeof quote === "string")
    ) {
      throw new Error(`Invalid ${category} evidence.`);
    }
    const checked = verifyEvidence(evidence as string[], paddedTranscript);
    droppedEvidence += checked.dropped;

    scores[category] = {
      score,
      feedback: categoryValue.feedback.trim(),
      evidence: checked.verified,
    };
    overallScore += score;
  }

  if (!nonEmptyString(value.feedback)) {
    throw new Error("Invalid overall evaluation feedback.");
  }

  const rawFlags = value.review_flags;
  if (
    !Array.isArray(rawFlags) ||
    !rawFlags.every((flag) =>
      (MODEL_REVIEW_FLAGS as readonly unknown[]).includes(flag),
    )
  ) {
    throw new Error("Invalid evaluation review flags.");
  }
  const flags = new Set<ReviewFlag>(rawFlags as ReviewFlag[]);
  if (droppedEvidence > 0) flags.add("unsupported_evidence");
  if (adjustedScores) flags.add("score_adjusted");
  if (transcript.trim().split(/\s+/).filter(Boolean).length < MIN_TRANSCRIPT_WORDS) {
    flags.add("transcript_too_short");
  }

  return {
    scores,
    feedback: value.feedback.trim(),
    strengths: validateStringArray(value.strengths, "strengths"),
    improvements: validateStringArray(value.improvements, "improvements"),
    reviewFlags: [...flags],
    overallScore,
  };
}
