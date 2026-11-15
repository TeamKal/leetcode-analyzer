import "server-only";

import Groq from "groq-sdk";
import { EVALUATION_SYSTEM_PROMPT } from "./prompt";
import { EVALUATION_RESPONSE_SCHEMA } from "./validator";

const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";
const GROQ_REQUEST_TIMEOUT_MS = 40_000;

export type ExplanationInput = {
  transcript: string;
  problemSlug: string;
  problemTitle: string;
};

export async function evaluateStudentExplanation(input: ExplanationInput) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
  const groq = new Groq({
    apiKey,
    maxRetries: 0,
    timeout: GROQ_REQUEST_TIMEOUT_MS,
  });
  const completion = await groq.chat.completions.create({
    model,
    stream: false,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "student_explanation_evaluation_v1",
        strict: true,
        schema: EVALUATION_RESPONSE_SCHEMA,
      },
    },
    messages: [
      { role: "system", content: EVALUATION_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          problem_slug: input.problemSlug,
          problem_title: input.problemTitle,
          transcript: input.transcript,
        }),
      },
    ],
  });

  const choice = completion.choices[0];
  if (!choice || choice.finish_reason !== "stop") {
    throw new Error("Groq returned an incomplete evaluation.");
  }
  if (typeof choice.message.content !== "string") {
    throw new Error("Groq returned no evaluation content.");
  }

  let response: unknown;
  try {
    response = JSON.parse(choice.message.content) as unknown;
  } catch {
    throw new Error("Groq returned malformed evaluation JSON.");
  }

  return {
    modelName: completion.model || model,
    response,
  };
}
