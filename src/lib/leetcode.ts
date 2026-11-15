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
