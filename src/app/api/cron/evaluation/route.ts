import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAuthAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedEvaluationCronRequest } from "@/lib/evaluation/cronAuth";
import {
  evaluateStudentExplanation,
  generateProblemReferenceCard,
} from "@/lib/evaluation/groq";
import { resolveProblemContext } from "@/lib/evaluation/problemContext";
import { processOneEvaluationJob } from "@/lib/evaluation/processor";
import { getOrCreateReferenceCard } from "@/lib/evaluation/referenceCard";
import { fetchLeetCodeProblemDetails } from "@/lib/leetcode/problemDetails";
import { validateEvaluationResponse } from "@/lib/evaluation/validator";

export const runtime = "nodejs";
export const maxDuration = 60;

function serviceUnavailable() {
  return NextResponse.json(
    { status: "unavailable", message: "Evaluation processing is unavailable." },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  if (
    !isAuthorizedEvaluationCronRequest(
      request.headers.get("authorization"),
      process.env.EVALUATION_CRON_SECRET,
    )
  ) {
    return NextResponse.json(
      { status: "unauthorized", message: "Unauthorized." },
      { status: 401 },
    );
  }

  const workerId = randomUUID();
  let admin: ReturnType<typeof createAuthAdminClient>;
  try {
    admin = createAuthAdminClient();
  } catch {
    return serviceUnavailable();
  }

  const result = await processOneEvaluationJob(workerId, {
    recoverStaleJobs: async (timeoutMinutes) => {
      const { data, error } = await admin.rpc("recover_stale_jobs", {
        p_timeout_minutes: timeoutMinutes,
      });
      return { data, error };
    },
    claimJob: async (claimedWorkerId) => {
      const { data, error } = await admin.rpc("claim_evaluation_job", {
        p_worker_id: claimedWorkerId,
      });
      return { data, error };
    },
    evaluate: async (job) => {
      // Phase 1: the real problem statement (DB first, fetched once if missing).
      const context = await resolveProblemContext(
        job.problemSlug,
        job.problemTitle,
        {
          lookup: async (slug) => {
            const { data, error } = await admin
              .from("problems")
              .select("id,title,difficulty,description")
              .eq("leetcode_slug", slug)
              .maybeSingle();
            if (error) throw new Error("Problem lookup failed.");
            return data;
          },
          fetchDetails: (slug) => fetchLeetCodeProblemDetails(slug),
          saveDescription: async (problemId, promptText) => {
            await admin
              .from("problems")
              .update({ description: promptText })
              .eq("id", problemId)
              .is("description", null);
          },
        },
      );

      // Phase 2: a cached per-problem answer key so every student is judged
      // against the same reference. Failure degrades gracefully (flagged).
      const reference = context.problemId
        ? await getOrCreateReferenceCard({
            find: async () => {
              const { data, error } = await admin
                .from("problem_reference_cards")
                .select("card")
                .eq("problem_id", context.problemId as string)
                .maybeSingle();
              if (error) throw new Error("Reference lookup failed.");
              return data?.card ?? null;
            },
            generate: () =>
              generateProblemReferenceCard({
                slug: job.problemSlug,
                title: context.title,
                promptText: context.promptText,
              }),
            save: async (card, modelName) => {
              await admin.from("problem_reference_cards").upsert(
                {
                  problem_id: context.problemId,
                  card,
                  model_name: modelName,
                },
                { onConflict: "problem_id", ignoreDuplicates: true },
              );
            },
          })
        : ({ card: null, source: "unavailable" } as const);

      const extraFlags: string[] = [];
      if (!context.promptText) extraFlags.push("no_problem_statement");
      if (!reference.card) extraFlags.push("reference_unavailable");
      else if (reference.card.confidence === "low") {
        extraFlags.push("reference_low_confidence");
      }

      const evaluation = await evaluateStudentExplanation({
        transcript: job.transcript,
        problemSlug: job.problemSlug,
        problemTitle: context.title,
        problemText: context.promptText,
        referenceCard: reference.card,
      });
      return { ...evaluation, extraFlags };
    },
    validate: validateEvaluationResponse,
    renewLease: async (jobId, claimedWorkerId) => {
      const { data, error } = await admin.rpc("renew_evaluation_job_lease", {
        p_job_id: jobId,
        p_worker_id: claimedWorkerId,
      });
      return { data, error };
    },
    completeJob: async (arguments_) => {
      const { data, error } = await admin.rpc(
        "complete_evaluation_job",
        arguments_,
      );
      return { data, error };
    },
    failJob: async (jobId, claimedWorkerId, sanitizedError) => {
      const { data, error } = await admin.rpc("fail_evaluation_job", {
        p_job_id: jobId,
        p_worker_id: claimedWorkerId,
        p_error: sanitizedError,
      });
      return { data, error };
    },
  });

  if (result.status === "no_jobs") {
    return NextResponse.json({ status: "no_jobs" });
  }
  if (result.status === "completed") {
    return NextResponse.json({
      status: "completed",
      overall_score: result.overallScore,
    });
  }
  if (result.status === "failed") {
    return NextResponse.json({ status: "failed" });
  }
  if (result.status === "lease_lost") {
    return NextResponse.json({ status: "lease_lost" });
  }

  if (result.status === "failure_recording_failed") {
    console.error("Evaluation failure could not be recorded.");
  } else if (result.status === "completion_uncertain") {
    console.error("Evaluation completion outcome is uncertain.");
  } else if (result.status === "lease_check_failed") {
    console.error("Evaluation lease ownership could not be verified.");
  } else if (result.status === "recovery_failed") {
    console.error("Stale evaluation jobs could not be recovered.");
  } else if (result.status === "claim_failed") {
    console.error("An evaluation job could not be claimed.");
  } else {
    console.error("A claimed evaluation job was invalid.");
  }

  return serviceUnavailable();
}
