/** Pure helpers for the student's "My submissions" pages (no imports). */

export type StudentStatus = "scoring" | "awaiting_mentor" | "graded" | "failed";

/** Maps a database status to what a student sees. Drafts and uploads are not shown. */
export function getStudentStatus(status: string): StudentStatus | null {
  switch (status) {
    case "pending_evaluation":
    case "evaluating":
      return "scoring";
    case "evaluated":
      return "awaiting_mentor";
    case "graded":
      return "graded";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  scoring: "Being scored",
  awaiting_mentor: "Waiting for your mentor",
  graded: "Graded",
  failed: "Scoring failed",
};

export const STUDENT_STATUS_HINTS: Record<StudentStatus, string> = {
  scoring: "The AI is reading your explanation. This usually takes a minute or two.",
  awaiting_mentor: "Your AI score is ready. Your mentor will give the final grade.",
  graded: "Your mentor has given the final grade.",
  failed: "The AI could not score this one. Your mentor can still review your recording.",
};

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
