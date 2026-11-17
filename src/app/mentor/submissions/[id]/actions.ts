"use server";

import { revalidatePath } from "next/cache";
import { describeGradeError, parseScoreInput } from "@/lib/mentor/grading";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FEEDBACK = 4000;

type GradeInput = { submissionId?: unknown; score?: unknown; feedback?: unknown };

/** Saves the mentor's final grade. The database function re-checks role, class and status. */
export async function gradeSubmission(input: unknown) {
  if (typeof input !== "object" || input === null) {
    return { ok: false as const, error: "Check the grade and try again." };
  }
  const { submissionId, score, feedback } = input as GradeInput;

  const finalScore = parseScoreInput(score);
  if (typeof submissionId !== "string" || !UUID_PATTERN.test(submissionId)) {
    return { ok: false as const, error: "This submission is not valid." };
  }
  if (finalScore === null) {
    return { ok: false as const, error: "Enter a score from 0 to 10." };
  }
  if (feedback !== undefined && typeof feedback !== "string") {
    return { ok: false as const, error: "Check the feedback and try again." };
  }
  if (typeof feedback === "string" && feedback.length > MAX_FEEDBACK) {
    return { ok: false as const, error: "Feedback is too long." };
  }

  try {
    const supabase = await createClient();
    const access = await getCurrentApplicationAccess(supabase);
    if (
      access.status !== "allowed" ||
      (access.role !== "mentor" && access.role !== "admin")
    ) {
      return {
        ok: false as const,
        error: "You are not allowed to grade submissions.",
      };
    }

    const { error } = await supabase.rpc("grade_submission", {
      p_submission_id: submissionId,
      p_final_score: finalScore,
      p_feedback: feedback ?? null,
    });
    if (error) {
      return { ok: false as const, error: describeGradeError(error.message) };
    }

    revalidatePath("/mentor");
    revalidatePath(`/mentor/submissions/${submissionId}`);
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "The grade could not be saved. Please try again.",
    };
  }
}
