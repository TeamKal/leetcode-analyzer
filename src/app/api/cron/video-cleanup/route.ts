import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAuthorizedCleanupCronRequest } from "@/lib/cleanup/cronAuth";
import { processOneVideoCleanupJob } from "@/lib/cleanup/processor";
import { deleteStudentVideoObject } from "@/lib/r2/deleteVideo";
import { createAuthAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

function serviceUnavailable() {
  return NextResponse.json(
    { status: "unavailable", message: "Video cleanup is unavailable." },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  if (
    !isAuthorizedCleanupCronRequest(
      request.headers.get("authorization"),
      process.env.CLEANUP_CRON_SECRET,
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

  const result = await processOneVideoCleanupJob(workerId, {
    recoverStaleJobs: async (timeoutMinutes) => {
      const { data, error } = await admin.rpc(
        "recover_stale_video_cleanup_jobs",
        { p_timeout_minutes: timeoutMinutes },
      );
      return { data, error };
    },
    claimJob: async (claimedWorkerId) => {
      const { data, error } = await admin.rpc("claim_video_cleanup_job", {
        p_worker_id: claimedWorkerId,
      });
      return { data, error };
    },
    getJobContext: async (jobId, claimedWorkerId) => {
      const { data, error } = await admin.rpc("get_video_cleanup_job_context", {
        p_job_id: jobId,
        p_worker_id: claimedWorkerId,
      });
      return { data, error };
    },
    renewLease: async (jobId, claimedWorkerId) => {
      const { data, error } = await admin.rpc(
        "renew_video_cleanup_job_lease",
        { p_job_id: jobId, p_worker_id: claimedWorkerId },
      );
      return { data, error };
    },
    deleteObject: deleteStudentVideoObject,
    completeJob: async (jobId, claimedWorkerId) => {
      const { data, error } = await admin.rpc("complete_video_cleanup_job", {
        p_job_id: jobId,
        p_worker_id: claimedWorkerId,
      });
      return { data, error };
    },
    failJob: async (jobId, claimedWorkerId, sanitizedError) => {
      const { data, error } = await admin.rpc("fail_video_cleanup_job", {
        p_job_id: jobId,
        p_worker_id: claimedWorkerId,
        p_error: sanitizedError,
      });
      return { data, error };
    },
    now: () => new Date(),
  });

  if (result.status === "no_jobs") {
    return NextResponse.json({ status: "no_jobs" });
  }
  if (result.status === "completed") {
    return NextResponse.json({ status: "completed" });
  }
  if (result.status === "failed") {
    return NextResponse.json({ status: "failed" });
  }
  if (result.status === "lease_lost") {
    return NextResponse.json({ status: "lease_lost" });
  }

  if (result.status === "failure_recording_failed") {
    console.error("Video cleanup failure could not be recorded.");
  } else if (result.status === "completion_uncertain") {
    console.error("Video cleanup completion outcome is uncertain.");
  } else if (result.status === "lease_check_failed") {
    console.error("Video cleanup lease ownership could not be verified.");
  } else if (result.status === "recovery_failed") {
    console.error("Stale video cleanup jobs could not be recovered.");
  } else if (result.status === "claim_failed") {
    console.error("A video cleanup job could not be claimed.");
  } else {
    console.error("A claimed video cleanup job was invalid.");
  }

  return serviceUnavailable();
}
