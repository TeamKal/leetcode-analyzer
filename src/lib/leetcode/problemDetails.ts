// Fetches and formats a LeetCode problem for use as grading context.
// Uses LeetCode's public GraphQL endpoint (unofficial, undocumented), so every
// failure mode degrades to "no statement available" instead of throwing.

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GRAPHQL_URL = "https://leetcode.com/graphql/";

// ---- HTML -> plain text (pure) ----
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
  le: "≤",
  ge: "≥",
  ne: "≠",
  times: "×",
  minus: "−",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  rarr: "→",
  larr: "←",
  plusmn: "±",
  middot: "·",
};

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, "");
}

function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function htmlToText(html: string): string {
  let text = html.replace(/\r\n?/g, "\n");

  // Exponents and subscripts, e.g. 10<sup>4</sup> -> 10^4.
  text = text.replace(
    /<sup[^>]*>([\s\S]*?)<\/sup>/gi,
    (_match, inner: string) => `^${stripTags(inner)}`,
  );
  text = text.replace(
    /<sub[^>]*>([\s\S]*?)<\/sub>/gi,
    (_match, inner: string) => `_${stripTags(inner)}`,
  );

  text = text.replace(/<img[^>]*>/gi, "[image]");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<li[^>]*>/gi, "\n- ");
  text = text.replace(/<\/(p|div|ul|ol|pre|h[1-6]|li|tr|table)>/gi, "\n");
  text = text.replace(/<(p|div|ul|ol|pre|h[1-6]|table|tr)[^>]*>/gi, "\n");
  text = stripTags(text);

  // Decode only after tags are gone, so "&lt;b&gt;" stays literal text.
  text = decodeEntities(text);

  text = text.replace(/[ \t ]+/g, " ");
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

const MAX_STATEMENT_CHARS = 6000;
const MAX_HINT_CHARS = 600;
const MAX_HINTS = 5;
const MAX_TOPICS = 12;

const QUERY =
  "query problemDetails($titleSlug: String!) { question(titleSlug: $titleSlug) { title titleSlug difficulty isPaidOnly content topicTags { name } hints } }";

export type LeetCodeProblemDetails = {
  title: string;
  difficulty: "Easy" | "Medium" | "Hard" | null;
  isPaidOnly: boolean;
  topics: string[];
  // Plain-text block used as grading context; null when LeetCode exposes no
  // public statement (paid-only problems) or the fetch failed.
  promptText: string | null;
};

function truncate(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()} …[truncated]`;
}

export function formatProblemPromptText(input: {
  title: string;
  difficulty: string | null;
  topics: string[];
  statementText: string | null;
  hints: string[];
}): string | null {
  const statement = input.statementText?.trim();
  if (!statement) return null;

  const lines = [`Title: ${input.title}`];
  if (input.difficulty) lines.push(`Difficulty: ${input.difficulty}`);
  if (input.topics.length > 0) {
    lines.push(`Topics: ${input.topics.slice(0, MAX_TOPICS).join(", ")}`);
  }
  lines.push("", "Statement:", truncate(statement, MAX_STATEMENT_CHARS));

  const hints = input.hints
    .map((hint) => htmlToText(hint))
    .filter(Boolean)
    .slice(0, MAX_HINTS);
  if (hints.length > 0) {
    lines.push("", "Hints (partial guidance, not a full solution):");
    hints.forEach((hint, index) => {
      lines.push(`${index + 1}. ${truncate(hint, MAX_HINT_CHARS)}`);
    });
  }
  return lines.join("\n");
}

export async function fetchLeetCodeProblemDetails(
  slug: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<LeetCodeProblemDetails | null> {
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) return null;

  try {
    const response = await (options.fetchImpl ?? fetch)(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { titleSlug: slug } }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    });
    if (!response.ok) return null;

    const result = (await response.json()) as {
      data?: {
        question?: {
          title?: unknown;
          titleSlug?: unknown;
          difficulty?: unknown;
          isPaidOnly?: unknown;
          content?: unknown;
          topicTags?: unknown;
          hints?: unknown;
        } | null;
      };
      errors?: unknown[];
    };
    const question = result.data?.question;
    if (
      result.errors?.length ||
      !question ||
      typeof question.title !== "string" ||
      !question.title ||
      question.titleSlug !== slug
    ) {
      return null;
    }

    const difficulty =
      question.difficulty === "Easy" ||
      question.difficulty === "Medium" ||
      question.difficulty === "Hard"
        ? question.difficulty
        : null;
    const topics = Array.isArray(question.topicTags)
      ? question.topicTags
          .map((tag: unknown) =>
            typeof tag === "object" && tag !== null
              ? (tag as { name?: unknown }).name
              : null,
          )
          .filter((name): name is string => typeof name === "string" && !!name)
      : [];
    const hints = Array.isArray(question.hints)
      ? question.hints.filter((hint: unknown): hint is string => typeof hint === "string")
      : [];
    const statementText =
      typeof question.content === "string" ? htmlToText(question.content) : null;

    return {
      title: question.title,
      difficulty,
      isPaidOnly: question.isPaidOnly === true,
      topics,
      promptText: formatProblemPromptText({
        title: question.title,
        difficulty,
        topics,
        statementText,
        hints,
      }),
    };
  } catch {
    return null;
  }
}
