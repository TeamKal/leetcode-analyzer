export const EVALUATION_RUBRIC = {
  problem_understanding: 2,
  approach: 2,
  reasoning: 2,
  edge_cases: 1,
  complexity: 1,
  communication: 2,
} as const;

export type EvaluationCategory = keyof typeof EVALUATION_RUBRIC;

export type EvaluationScore = {
  score: number;
  feedback: string;
};

export type EvaluationResponse = {
  scores: Record<EvaluationCategory, EvaluationScore>;
  feedback: string;
  strengths: string[];
  improvements: string[];
};

export type ValidatedEvaluation = EvaluationResponse & {
  overallScore: number;
};

const CATEGORIES = Object.keys(EVALUATION_RUBRIC) as EvaluationCategory[];
const RESPONSE_KEYS = ["scores", "feedback", "strengths", "improvements"];
const SCORE_KEYS = ["score", "feedback"];

export const EVALUATION_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      properties: {
        problem_understanding: {
          type: "object",
          additionalProperties: false,
          properties: {
            score: { type: "number", minimum: 0, maximum: 2 },
            feedback: { type: "string", minLength: 1 },
          },
          required: ["score", "feedback"],
        },
        approach: {
          type: "object",
          additionalProperties: false,
          properties: {
            score: { type: "number", minimum: 0, maximum: 2 },
            feedback: { type: "string", minLength: 1 },
          },
          required: ["score", "feedback"],
        },
        reasoning: {
          type: "object",
          additionalProperties: false,
          properties: {
            score: { type: "number", minimum: 0, maximum: 2 },
            feedback: { type: "string", minLength: 1 },
          },
          required: ["score", "feedback"],
        },
        edge_cases: {
          type: "object",
          additionalProperties: false,
          properties: {
            score: { type: "number", minimum: 0, maximum: 1 },
            feedback: { type: "string", minLength: 1 },
          },
          required: ["score", "feedback"],
        },
        complexity: {
          type: "object",
          additionalProperties: false,
          properties: {
            score: { type: "number", minimum: 0, maximum: 1 },
            feedback: { type: "string", minLength: 1 },
          },
          required: ["score", "feedback"],
        },
        communication: {
          type: "object",
          additionalProperties: false,
          properties: {
            score: { type: "number", minimum: 0, maximum: 2 },
            feedback: { type: "string", minLength: 1 },
          },
          required: ["score", "feedback"],
        },
      },
      required: CATEGORIES,
    },
    feedback: { type: "string", minLength: 1 },
    strengths: { type: "array", items: { type: "string", minLength: 1 } },
    improvements: {
      type: "array",
      items: { type: "string", minLength: 1 },
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

export function validateEvaluationResponse(
  value: unknown,
): ValidatedEvaluation {
  if (!isRecord(value) || !hasExactKeys(value, RESPONSE_KEYS)) {
    throw new Error("Invalid evaluation response shape.");
  }

  if (!isRecord(value.scores) || !hasExactKeys(value.scores, CATEGORIES)) {
    throw new Error("Invalid evaluation score categories.");
  }

  const scores = {} as Record<EvaluationCategory, EvaluationScore>;
  let overallScore = 0;
  for (const category of CATEGORIES) {
    const categoryValue = value.scores[category];
    if (!isRecord(categoryValue) || !hasExactKeys(categoryValue, SCORE_KEYS)) {
      throw new Error(`Invalid ${category} evaluation.`);
    }

    const score = categoryValue.score;
    if (
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > EVALUATION_RUBRIC[category]
    ) {
      throw new Error(`Invalid ${category} score.`);
    }
    if (!nonEmptyString(categoryValue.feedback)) {
      throw new Error(`Invalid ${category} feedback.`);
    }

    scores[category] = {
      score,
      feedback: categoryValue.feedback.trim(),
    };
    overallScore += score;
  }

  if (!nonEmptyString(value.feedback)) {
    throw new Error("Invalid overall evaluation feedback.");
  }

  return {
    scores,
    feedback: value.feedback.trim(),
    strengths: validateStringArray(value.strengths, "strengths"),
    improvements: validateStringArray(value.improvements, "improvements"),
    overallScore,
  };
}
