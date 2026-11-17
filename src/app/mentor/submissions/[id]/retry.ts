"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/student/status";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";

/**
 * Queues a failed AI evaluation to run again. The mentor comes from the session,
 * the job is found through row-level security (only their class's submissions
 * are visible), and the database function re-checks the role, the class and
 * that the evaluation really failed.
 */
export async function retryEvaluation(submissionId: unknown) {
  if (!isUuid(submissionId)) {
    return { ok: false as const, error: "This submission is not valid." };
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
        error: "You are not allowed to retry evaluations.",
      };
    }

    const { data: job, error: jobError } = await supabase
      .from("evaluation_jobs")
      .select("id")
      .eq("submission_id", submissionId)
      .maybeSingle();
    if (jobError || !job) {
      return { ok: false as const, error: "This submission could not be found." };
    }

    const { error } = await supabase.rpc("retry_failed_evaluation", {
      p_job_id: job.id,
    });
    if (error) {
      return {
        ok: false as const,
        error: /Only failed evaluations/.test(error.message)
          ? "This evaluation is not in a failed state, so it cannot be retried."
          : "The evaluation could not be restarted. Please try again.",
      };
    }

    revalidatePath("/mentor");
    revalidatePath(`/mentor/submissions/${submissionId}`);
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "The evaluation could not be restarted. Please try again.",
    };
  }
}
