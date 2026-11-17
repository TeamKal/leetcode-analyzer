/** Pure validation for enrolling a student (shared by the admin and mentor actions). */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StudentInput = {
  fullName: string;
  googleEmail: string;
  leetcodeUsername: string;
};

/** Trims and checks the three enrollment fields. Returns null if any is invalid. */
export function parseStudentInput(input: unknown): StudentInput | null {
  if (typeof input !== "object" || input === null) return null;

  const { fullName, googleEmail, leetcodeUsername } = input as Record<
    string,
    unknown
  >;
  if (
    typeof fullName !== "string" ||
    typeof googleEmail !== "string" ||
    typeof leetcodeUsername !== "string"
  ) {
    return null;
  }

  const name = fullName.trim();
  const email = googleEmail.trim().toLowerCase();
  const username = leetcodeUsername.trim();
  if (
    name.length < 1 ||
    name.length > 150 ||
    email.length > 254 ||
    !EMAIL_PATTERN.test(email) ||
    username.length < 1 ||
    username.length > 100 ||
    /\s/.test(username)
  ) {
    return null;
  }

  return { fullName: name, googleEmail: email, leetcodeUsername: username };
}
