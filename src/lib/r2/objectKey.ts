const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

// Lowercase only, so a key cannot alias another object via case tricks.
const OBJECT_KEY_PATTERN = new RegExp(
  `^students/(${UUID})/videos/(${UUID})\\.(mp4|webm)$`,
);

export type ParsedStudentVideoKey = { studentId: string; videoId: string };

export function parseStudentVideoKey(
  objectKey: unknown,
): ParsedStudentVideoKey | null {
  if (typeof objectKey !== "string" || objectKey.length > 200) return null;
  const match = OBJECT_KEY_PATTERN.exec(objectKey);
  if (!match) return null;
  return { studentId: match[1], videoId: match[2] };
}

export function isKeyInStudentPrefix(
  studentId: unknown,
  objectKey: unknown,
): boolean {
  if (typeof studentId !== "string") return false;
  const parsed = parseStudentVideoKey(objectKey);
  return parsed !== null && parsed.studentId === studentId.toLowerCase();
}
