export type LeetCodeProblemUrl = {
  href: string;
  slug: string;
};

const PROBLEM_PATH_PATTERN =
  /^\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/submissions\/\d+)?\/?$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseLeetCodeProblemUrl(
  value: string,
): LeetCodeProblemUrl | null {
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      (url.hostname !== "leetcode.com" &&
        url.hostname !== "www.leetcode.com") ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }

    const match = PROBLEM_PATH_PATTERN.exec(url.pathname);
    if (!match) return null;

    return { href: url.href, slug: match[1] };
  } catch {
    return null;
  }
}

export function isLeetCodeProblemSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_PATTERN.test(value);
}

export type LeetCodeSubmissionLink = LeetCodeProblemUrl & {
  /** LeetCode's numeric submission id, as text. */
  submissionId: string;
};

export type SubmissionInputCheck =
  | { ok: true; link: LeetCodeSubmissionLink }
  | {
      ok: false;
      reason:
        | "empty"
        | "just_a_number"
        | "not_a_link"
        | "not_leetcode"
        | "problem_only"
        | "no_problem_name"
        | "invalid";
      message: string;
    };

const SUBMISSION_PATH_PATTERN =
  /^\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)\/submissions\/(\d+)\/?$/;
const SUBMISSION_DETAIL_PATH_PATTERN = /^\/submissions\/detail\/\d+\/?$/;

function failure(
  reason: Extract<SubmissionInputCheck, { ok: false }>["reason"],
  message: string,
): SubmissionInputCheck {
  return { ok: false, reason, message };
}

/**
 * Checks what a student pasted into the "submission" field. Only a full
 * submission link is accepted, because a bare submission id does not say which
 * problem it belongs to. Returns the problem and submission id, or a friendly
 * reason why the input cannot be used.
 */
export function checkSubmissionInput(value: string): SubmissionInputCheck {
  const text = value.trim();
  if (!text) return failure("empty", "Paste the link to your LeetCode submission.");

  if (/^\d+$/.test(text)) {
    return failure(
      "just_a_number",
      "A number on its own is not enough, because we also need to know the problem. Open your submission on LeetCode and paste its link.",
    );
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return failure(
      "not_a_link",
      "That does not look like a link. Open your submission on LeetCode and copy the address from the browser.",
    );
  }

  const host = url.hostname;
  if (
    url.protocol !== "https:" ||
    (host !== "leetcode.com" && host !== "www.leetcode.com") ||
    url.username ||
    url.password ||
    url.port
  ) {
    return failure(
      "not_leetcode",
      "Use a link from leetcode.com that starts with https://.",
    );
  }

  const match = SUBMISSION_PATH_PATTERN.exec(url.pathname);
  if (match) {
    return {
      ok: true,
      link: { href: url.href, slug: match[1], submissionId: match[2] },
    };
  }

  if (PROBLEM_PATH_PATTERN.test(url.pathname)) {
    return failure(
      "problem_only",
      "That is the link to the problem. Open one of your submissions and copy its link instead. It ends with /submissions/ and a number.",
    );
  }

  if (SUBMISSION_DETAIL_PATH_PATTERN.test(url.pathname)) {
    return failure(
      "no_problem_name",
      "This link does not say which problem it belongs to. Open the submission from the problem page, so the link includes the problem name.",
    );
  }

  return failure(
    "invalid",
    "That is not a LeetCode submission link. It should look like leetcode.com/problems/two-sum/submissions/123456789/.",
  );
}
