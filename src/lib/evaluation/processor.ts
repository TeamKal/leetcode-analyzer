export type ClaimedEvaluationJob = {
  jobId: string;
  submissionUrl: string;
  videoObjectKey: string;
  transcript: string;
  problemSlug: string;
  problemTitle: string;
};

export type ValidatedEvaluation = {
  scores: Record<
    string,
    { score: number; feedback: string; evidence: string[] }
  >;
  overallScore: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  reviewFlags: string[];
};

export type CompleteEvaluationArguments = {
  p_job_id: string;
  p_worker_id: string;
  p_model_name: string;
  p_rubric_version: "v2";
  p_scores: ValidatedEvaluation["scores"];
  p_overall_score: number;
  p_feedback: string;
  p_strengths: string[];
  p_improvements: string[];
  p_review_flags: string[];
};

export type ProcessorRpcResult = {
  data?: unknown;
  error?: unknown | null;
};

export type EvaluationProcessorDependencies = {
  recoverStaleJobs: (timeoutMinutes: number) => Promise<ProcessorRpcResult>;
  claimJob: (workerId: string) => Promise<ProcessorRpcResult>;
  evaluate: (job: ClaimedEvaluationJob) => Promise<{
    modelName: string;
    response: unknown;
    // Flags the backend itself established while preparing the request
    // (for example a missing problem statement); merged into the result.
    extraFlags?: string[];
  }>;
  validate: (response: unknown, transcript: string) => ValidatedEvaluation;
  renewLease: (jobId: string, workerId: string) => Promise<ProcessorRpcResult>;
  completeJob: (
    arguments_: CompleteEvaluationArguments,
  ) => Promise<ProcessorRpcResult>;
  failJob: (
    jobId: string,
    workerId: string,
    sanitizedError: string,
  ) => Promise<ProcessorRpcResult>;
};

export type EvaluationProcessorResult =
  | { status: "no_jobs" }
  | { status: "completed"; overallScore: number }
  | { status: "failed" }
  | { status: "failure_recording_failed" }
  | { status: "recovery_failed" }
  | { status: "claim_failed" }
  | { status: "invalid_claim" }
  | { status: "lease_lost" }
  | { status: "lease_check_failed" }
  | { status: "completion_uncertain" };

const MAX_STALE_JOB_MINUTES = 15;
const SANITIZED_PROCESSING_ERROR = "Evaluation processing failed.";
const SANITIZED_INVALID_JOB_ERROR = "Claimed evaluation job was invalid.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function parseClaimedJob(
  value: unknown,
):
  | { kind: "none" }
  | { kind: "invalid"; jobId: string | null }
  | { kind: "job"; job: ClaimedEvaluationJob } {
  let candidate = value;
  if (Array.isArray(candidate)) {
    if (candidate.length === 0) return { kind: "none" };
    if (candidate.length !== 1) return { kind: "invalid", jobId: null };
    candidate = candidate[0];
  }

  if (candidate === null || candidate === undefined) {
    return { kind: "none" };
  }
  if (!isRecord(candidate)) {
    return { kind: "invalid", jobId: null };
  }

  const jobId = readString(candidate, ["job_id", "evaluation_job_id", "id"]);
  const submissionUrl = readString(candidate, [
    "leetcode_submission_url",
    "submission_url",
  ]);
  const videoObjectKey = readString(candidate, ["video_object_key"]);
  const transcript = readString(candidate, ["transcript"]);
  const problemSlug = readString(candidate, ["leetcode_slug"]);
  const problemTitle = readString(candidate, ["problem_title"]);

  if (
    !jobId ||
    !submissionUrl ||
    !videoObjectKey ||
    !transcript ||
    !problemSlug ||
    !problemTitle
  ) {
    return { kind: "invalid", jobId };
  }

  return {
    kind: "job",
    job: {
      jobId,
      submissionUrl,
      videoObjectKey,
      transcript,
      problemSlug,
      problemTitle,
    },
  };
}

async function recordFailure(
  dependencies: EvaluationProcessorDependencies,
  jobId: string,
  workerId: string,
  sanitizedError: string,
): Promise<boolean> {
  try {
    const result = await dependencies.failJob(jobId, workerId, sanitizedError);
    if (!result.error && result.data !== false) return true;
  } catch {
    // Keep provider and database errors out of logs and client responses.
  }

  return false;
}

export async function processOneEvaluationJob(
  workerId: string,
  dependencies: EvaluationProcessorDependencies,
): Promise<EvaluationProcessorResult> {
  try {
    const recovery = await dependencies.recoverStaleJobs(MAX_STALE_JOB_MINUTES);
    if (recovery.error) return { status: "recovery_failed" };
  } catch {
    return { status: "recovery_failed" };
  }

  let claimResult: ProcessorRpcResult;
  try {
    claimResult = await dependencies.claimJob(workerId);
  } catch {
    return { status: "claim_failed" };
  }
  if (claimResult.error) return { status: "claim_failed" };

  const claim = parseClaimedJob(claimResult.data);
  if (claim.kind === "none") return { status: "no_jobs" };
  if (claim.kind === "invalid") {
    if (!claim.jobId) return { status: "invalid_claim" };
    const recorded = await recordFailure(
      dependencies,
      claim.jobId,
      workerId,
      SANITIZED_INVALID_JOB_ERROR,
    );
    return recorded
      ? { status: "failed" }
      : { status: "failure_recording_failed" };
  }

  let evaluation: ValidatedEvaluation;
  let modelName: string;
  try {
    const generated = await dependencies.evaluate(claim.job);
    if (
      typeof generated.modelName !== "string" ||
      !generated.modelName.trim()
    ) {
      throw new Error("Invalid model name.");
    }
    evaluation = dependencies.validate(generated.response, claim.job.transcript);
    if (generated.extraFlags?.length) {
      evaluation = {
        ...evaluation,
        reviewFlags: [
          ...new Set([...evaluation.reviewFlags, ...generated.extraFlags]),
        ],
      };
    }
    modelName = generated.modelName;
  } catch {
    const recorded = await recordFailure(
      dependencies,
      claim.job.jobId,
      workerId,
      SANITIZED_PROCESSING_ERROR,
    );
    return recorded
      ? { status: "failed" }
      : { status: "failure_recording_failed" };
  }

  let leaseResult: ProcessorRpcResult;
  try {
    leaseResult = await dependencies.renewLease(claim.job.jobId, workerId);
  } catch {
    return { status: "lease_check_failed" };
  }
  if (leaseResult.error) return { status: "lease_check_failed" };
  if (leaseResult.data !== true) return { status: "lease_lost" };

  try {
    const completion = await dependencies.completeJob({
      p_job_id: claim.job.jobId,
      p_worker_id: workerId,
      p_model_name: modelName,
      p_rubric_version: "v2",
      p_scores: evaluation.scores,
      p_overall_score: evaluation.overallScore,
      p_feedback: evaluation.feedback,
      p_strengths: evaluation.strengths,
      p_improvements: evaluation.improvements,
      p_review_flags: evaluation.reviewFlags,
    });
    if (completion.error || completion.data === false) {
      return { status: "completion_uncertain" };
    }
  } catch {
    return { status: "completion_uncertain" };
  }

  return { status: "completed", overallScore: evaluation.overallScore };
}
