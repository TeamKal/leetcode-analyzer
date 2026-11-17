import "server-only";

import { firstOf } from "@/lib/mentor/grading";
import { getStudentStatus, type StudentStatus } from "@/lib/student/status";
import { createAuthAdminClient } from "@/lib/supabase/admin";

/**
 * What a student may see about their own submissions. This is read on the
 * server with the student id taken from the session, and it selects a fixed
 * list of fields: never the transcript, and never the evidence quotes.
 */

type Embedded<T> = T | T[] | null;

type RawSubmission = {
  id: string;
  status: string;
  submitted_at: string | null;
  problems: Embedded<{ title: string; difficulty: string | null }>;
  evaluations: Embedded<{
    overall_score: number | string;
    feedback: string;
    scores: unknown;
    strengths: unknown;
    improvements: unknown;
  }>;
  mentor_grades: Embedded<{
    final_score: number | string;
    feedback: string | null;
    graded_at: string;
  }>;
};

export type StudentSubmission = {
  id: string;
  status: StudentStatus;
  submittedAt: string | null;
  problemTitle: string;
  difficulty: string | null;
  aiScore: number | null;
  finalScore: number | null;
};

export type StudentSubmissionDetail = StudentSubmission & {
  evaluation: {
    overall_score: number | string;
    feedback: string;
    scores: unknown;
    strengths: unknown;
    improvements: unknown;
    review_flags: unknown;
  } | null;
  grade: { finalScore: number; feedback: string | null; gradedAt: string } | null;
};

const LIST_FIELDS =
  "id,status,submitted_at,problems(title,difficulty),evaluations(overall_score),mentor_grades(final_score)";
const DETAIL_FIELDS =
  "id,status,submitted_at,problems(title,difficulty),evaluations(overall_score,feedback,scores,strengths,improvements),mentor_grades(final_score,feedback,graded_at)";

function toSummary(raw: RawSubmission): StudentSubmission | null {
  const status = getStudentStatus(raw.status);
  if (!status) return null;
  const problem = firstOf(raw.problems);
  const evaluation = firstOf(raw.evaluations);
  const grade = firstOf(raw.mentor_grades);
  return {
    id: raw.id,
    status,
    submittedAt: raw.submitted_at,
    problemTitle: problem?.title ?? "Unknown problem",
    difficulty: problem?.difficulty ?? null,
    aiScore: evaluation ? Number(evaluation.overall_score) : null,
    finalScore: grade ? Number(grade.final_score) : null,
  };
}

export async function listMySubmissions(
  studentId: string,
): Promise<StudentSubmission[] | null> {
  const admin = createAuthAdminClient();
  const { data, error } = await admin
    .from("submissions")
    .select(LIST_FIELDS)
    .eq("student_id", studentId)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) return null;

  const rows: StudentSubmission[] = [];
  for (const raw of (data ?? []) as unknown as RawSubmission[]) {
    const row = toSummary(raw);
    if (row) rows.push(row);
  }
  return rows;
}

/** Returns undefined if the submission is not this student's, null on a read error. */
export async function getMySubmission(
  studentId: string,
  submissionId: string,
): Promise<StudentSubmissionDetail | null | undefined> {
  const admin = createAuthAdminClient();
  const { data, error } = await admin
    .from("submissions")
    .select(DETAIL_FIELDS)
    .eq("id", submissionId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) return null;
  if (!data) return undefined;

  const raw = data as unknown as RawSubmission;
  const summary = toSummary(raw);
  if (!summary) return undefined;

  const evaluation = firstOf(raw.evaluations);
  const grade = firstOf(raw.mentor_grades);
  return {
    ...summary,
    evaluation: evaluation ? { ...evaluation, review_flags: [] } : null,
    grade: grade
      ? {
          finalScore: Number(grade.final_score),
          feedback: grade.feedback,
          gradedAt: grade.graded_at,
        }
      : null,
  };
}
