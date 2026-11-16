export type ProcessorRpcResult = {
  data?: unknown;
  error?: unknown | null;
};

export type CleanupDeleteResult =
  | { status: "deleted" }
  | { status: "invalid_key" }
  | { status: "unavailable" };

export type VideoCleanupDependencies = {
  recoverStaleJobs: (timeoutMinutes: number) => Promise<ProcessorRpcResult>;
  claimJob: (workerId: string) => Promise<ProcessorRpcResult>;
  getJobContext: (
    jobId: string,
    workerId: string,
  ) => Promise<ProcessorRpcResult>;
  renewLease: (jobId: string, workerId: string) => Promise<ProcessorRpcResult>;
  // Must validate the key against the student's prefix itself.
  deleteObject: (
    studentId: string,
    objectKey: string,
  ) => Promise<CleanupDeleteResult>;
  completeJob: (jobId: string, workerId: string) => Promise<ProcessorRpcResult>;
  failJob: (
    jobId: string,
    workerId: string,
    sanitizedError: string,
  ) => Promise<ProcessorRpcResult>;
  now: () => Date;
};

export type VideoCleanupResult =
  | { status: "no_jobs" }
  | { status: "completed" }
  | { status: "failed" }
  | { status: "failure_recording_failed" }
  | { status: "recovery_failed" }
  | { status: "claim_failed" }
  | { status: "invalid_claim" }
  | { status: "lease_lost" }
  | { status: "lease_check_failed" }
  | { status: "completion_uncertain" };

const MAX_STALE_JOB_MINUTES = 15;
const ELIGIBLE_STATUSES = new Set(["evaluated", "graded"]);

const ERROR_INVALID_JOB = "Claimed cleanup job was invalid.";
const ERROR_NOT_ELIGIBLE = "Video is not eligible for cleanup.";
const ERROR_INVALID_KEY = "Video object key was invalid.";
const ERROR_DELETE_FAILED = "Video object deletion failed.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function singleRow(
  value: unknown,
): { kind: "none" } | { kind: "invalid" } | { kind: "row"; row: Record<string, unknown> } {
  let candidate = value;
  if (Array.isArray(candidate)) {
    if (candidate.length === 0) return { kind: "none" };
    if (candidate.length !== 1) return { kind: "invalid" };
    candidate = candidate[0];
  }
  if (candidate === null || candidate === undefined) return { kind: "none" };
  if (!isRecord(candidate)) return { kind: "invalid" };
  return { kind: "row", row: candidate };
}

async function recordFailure(
  dependencies: VideoCleanupDependencies,
  jobId: string,
  workerId: string,
  sanitizedError: string,
): Promise<VideoCleanupResult> {
  try {
    const result = await dependencies.failJob(jobId, workerId, sanitizedError);
    if (!result.error && result.data !== false) return { status: "failed" };
  } catch {
    // Keep provider and database errors out of logs and client responses.
  }
  return { status: "failure_recording_failed" };
}

async function leaseHeld(
  dependencies: VideoCleanupDependencies,
  jobId: string,
  workerId: string,
): Promise<"held" | "lost" | "unknown"> {
  try {
    const result = await dependencies.renewLease(jobId, workerId);
    if (result.error) return "unknown";
    return result.data === true ? "held" : "lost";
  } catch {
    return "unknown";
  }
}

export async function processOneVideoCleanupJob(
  workerId: string,
  dependencies: VideoCleanupDependencies,
): Promise<VideoCleanupResult> {
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

  const claimRow = singleRow(claimResult.data);
  if (claimRow.kind === "none") return { status: "no_jobs" };
  if (claimRow.kind === "invalid") return { status: "invalid_claim" };

  const jobId = readString(claimRow.row, "job_id");
  const claimedKey = readString(claimRow.row, "object_key");
  if (!jobId) return { status: "invalid_claim" };
  if (!claimedKey) {
    return recordFailure(dependencies, jobId, workerId, ERROR_INVALID_JOB);
  }

  // Re-check eligibility from the database before touching R2.
  let context: ReturnType<typeof singleRow>;
  try {
    const result = await dependencies.getJobContext(jobId, workerId);
    if (result.error) {
      return recordFailure(dependencies, jobId, workerId, ERROR_INVALID_JOB);
    }
    context = singleRow(result.data);
  } catch {
    return recordFailure(dependencies, jobId, workerId, ERROR_INVALID_JOB);
  }
  if (context.kind !== "row") {
    return recordFailure(dependencies, jobId, workerId, ERROR_INVALID_JOB);
  }

  const studentId = readString(context.row, "student_id");
  const contextKey = readString(context.row, "video_object_key");
  const submissionStatus = readString(context.row, "submission_status");
  const deleteAfterRaw = readString(context.row, "video_delete_after");
  const deletedAt = context.row["video_deleted_at"];
  const deleteAfter = deleteAfterRaw ? new Date(deleteAfterRaw) : null;

  if (!studentId || !contextKey || !submissionStatus) {
    return recordFailure(dependencies, jobId, workerId, ERROR_INVALID_JOB);
  }

  const eligible =
    ELIGIBLE_STATUSES.has(submissionStatus) &&
    deleteAfter !== null &&
    !Number.isNaN(deleteAfter.getTime()) &&
    deleteAfter.getTime() <= dependencies.now().getTime() &&
    (deletedAt === null || deletedAt === undefined) &&
    contextKey === claimedKey;
  if (!eligible) {
    return recordFailure(dependencies, jobId, workerId, ERROR_NOT_ELIGIBLE);
  }

  const leaseBefore = await leaseHeld(dependencies, jobId, workerId);
  if (leaseBefore === "unknown") return { status: "lease_check_failed" };
  if (leaseBefore === "lost") return { status: "lease_lost" };

  let deletion: CleanupDeleteResult;
  try {
    deletion = await dependencies.deleteObject(studentId, contextKey);
  } catch {
    deletion = { status: "unavailable" };
  }
  if (deletion.status === "invalid_key") {
    return recordFailure(dependencies, jobId, workerId, ERROR_INVALID_KEY);
  }
  if (deletion.status !== "deleted") {
    return recordFailure(dependencies, jobId, workerId, ERROR_DELETE_FAILED);
  }

  // The object is gone. Only mark it deleted in the DB if we still own the job.
  // If anything below fails, the job stays 'processing'; stale recovery re-queues
  // it and the retry treats the already-absent object as success.
  const leaseAfter = await leaseHeld(dependencies, jobId, workerId);
  if (leaseAfter === "unknown") return { status: "lease_check_failed" };
  if (leaseAfter === "lost") return { status: "lease_lost" };

  try {
    const completion = await dependencies.completeJob(jobId, workerId);
    if (completion.error || completion.data === false) {
      return { status: "completion_uncertain" };
    }
  } catch {
    return { status: "completion_uncertain" };
  }

  return { status: "completed" };
}
