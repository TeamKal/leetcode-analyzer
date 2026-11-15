import "server-only";

import { isLeetCodeProblemSlug } from "@/lib/leetcode";

export type LeetCodeProblemMetadata = {
  title: string;
  difficulty: "Easy" | "Medium" | "Hard" | null;
};

type LeetCodeGraphQLResponse = {
  data?: {
    question?: {
      title?: string;
      titleSlug?: string;
      difficulty?: string;
    } | null;
  };
  errors?: unknown[];
};

export async function getLeetCodeProblemMetadata(
  slug: string,
): Promise<LeetCodeProblemMetadata | null> {
  if (!isLeetCodeProblemSlug(slug)) {
    return null;
  }

  try {
    const response = await fetch("https://leetcode.com/graphql/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query:
          "query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { title titleSlug difficulty } }",
        variables: { titleSlug: slug },
      }),
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return null;
    }

    const result = (await response.json()) as LeetCodeGraphQLResponse;
    const question = result.data?.question;
    if (
      result.errors?.length ||
      !question?.title ||
      question.titleSlug !== slug
    ) {
      return null;
    }

    return {
      title: question.title,
      difficulty:
        question.difficulty === "Easy" ||
        question.difficulty === "Medium" ||
        question.difficulty === "Hard"
          ? question.difficulty
          : null,
    };
  } catch {
    return null;
  }
}
