import "server-only";

import Groq from "groq-sdk";
import {
  buildEvaluationMessages,
  type EvaluationPromptInput,
} from "./prompt";
import {
  REFERENCE_CARD_SCHEMA,
  buildReferenceCardMessages,
} from "./referenceCard";
import { EVALUATION_RESPONSE_SCHEMA } from "./validator";

const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";
// The reference card is generated once per problem, so a stronger model is
// worth it. Override with GROQ_REFERENCE_MODEL.
const DEFAULT_REFERENCE_MODEL = "openai/gpt-oss-120b";
// Evaluation and a first-time reference card must fit one 60s cron invocation.
const EVALUATION_TIMEOUT_MS = 30_000;
const REFERENCE_TIMEOUT_MS = 25_000;
// Same input should give the same scores run to run.
const TEMPERATURE = 0;
const SEED = 7;

function createClient(timeout: number) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }
  return new Groq({ apiKey, maxRetries: 0, timeout });
}

function isSchemaViolation(error: unknown) {
  const detail = error as {
    status?: number;
    error?: { error?: { code?: string } };
  };
  return (
    detail?.status === 400 &&
    detail.error?.error?.code === "json_validate_failed"
  );
}

async function structuredCompletion(input: {
  model: string;
  timeout: number;
  schemaName: string;
  schema: object;
  messages: { role: "system" | "user"; content: string }[];
  // Extra attempts (each with a new seed) after a strict-schema rejection.
  schemaRetries: number;
}) {
  const client = createClient(input.timeout);
  const request = (seed: number) =>
    client.chat.completions.create({
      model: input.model,
      stream: false,
      temperature: TEMPERATURE,
      seed,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          strict: true,
          schema: input.schema as Record<string, unknown>,
        },
      },
      messages: input.messages,
    });

  // Strict mode occasionally rejects a generation (a missing field, or text it
  // cannot encode as valid JSON). Retrying with a different seed usually works.
  let completion;
  for (let attempt = 0; ; attempt += 1) {
    try {
      completion = await request(SEED + attempt);
      break;
    } catch (error) {
      if (!isSchemaViolation(error) || attempt >= input.schemaRetries) {
        throw error;
      }
    }
  }

  const choice = completion.choices[0];
  if (!choice || choice.finish_reason !== "stop") {
    throw new Error("Groq returned an incomplete response.");
  }
  if (typeof choice.message.content !== "string") {
    throw new Error("Groq returned no content.");
  }

  let response: unknown;
  try {
    response = JSON.parse(choice.message.content) as unknown;
  } catch {
    throw new Error("Groq returned malformed JSON.");
  }

  return { modelName: completion.model || input.model, response };
}

export function evaluateStudentExplanation(input: EvaluationPromptInput) {
  return structuredCompletion({
    model: process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL,
    timeout: EVALUATION_TIMEOUT_MS,
    schemaName: "student_explanation_evaluation_v2",
    schema: EVALUATION_RESPONSE_SCHEMA,
    messages: buildEvaluationMessages(input),
    schemaRetries: 1,
  });
}

export function generateProblemReferenceCard(problem: {
  slug: string;
  title: string;
  promptText: string | null;
}) {
  return structuredCompletion({
    model:
      process.env.GROQ_REFERENCE_MODEL?.trim() || DEFAULT_REFERENCE_MODEL,
    timeout: REFERENCE_TIMEOUT_MS,
    schemaName: "problem_reference_card_v1",
    schema: REFERENCE_CARD_SCHEMA,
    messages: buildReferenceCardMessages(problem),
    // Cached after the first success, so extra attempts are cheap.
    schemaRetries: 2,
  });
}
