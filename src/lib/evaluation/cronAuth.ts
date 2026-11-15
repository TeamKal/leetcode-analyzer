import { timingSafeEqual } from "node:crypto";

export function isAuthorizedEvaluationCronRequest(
  authorizationHeader: string | null,
  configuredSecret: string | undefined,
): boolean {
  if (!authorizationHeader || !configuredSecret) {
    return false;
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorizationHeader);
  if (!match) {
    return false;
  }

  const supplied = Buffer.from(match[1], "utf8");
  const expected = Buffer.from(configuredSecret, "utf8");
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
