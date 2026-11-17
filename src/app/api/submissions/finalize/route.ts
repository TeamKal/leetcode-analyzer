import { NextResponse } from "next/server";
import { parseLeetCodeProblemUrl } from "@/lib/leetcode";
import { fetchLeetCodeProblemDetails } from "@/lib/leetcode/problemDetails";
import { verifyStudentVideoObject } from "@/lib/r2/verifyStudentVideo";
import { MAX_SUBMISSION_TRANSCRIPT_LENGTH } from "@/lib/submissions/constants";
import { createAuthAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStudentAccess } from "@/lib/supabase/student";
import { transcribeStudentVideo } from "@/lib/transcription/transcribeStudentVideo";

export const runtime = "nodejs";
// Transcription happens inside this request, so allow the provider time.
export const maxDuration = 60;

function errorResponse(error: string, message: string, status: number) {
  return NextResponse.json({ error, message }, { status });
}

const MAX_SUBMISSION_REQUEST_BODY_BYTES = 1024 * 1024;

type JsonBodyResult =
  | { ok: true; value: unknown }
  | {
      ok: false;
      error: string;
      message: string;
      status: 400 | 413;
    };

async function cancelRequestBody(request: Request) {
  try {
    await request.body?.cancel();
  } catch {
    // The request may already be closed or locked by the runtime.
  }
}

async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      await cancelRequestBody(request);
      return {
        ok: false,
        error: "invalid_request",
        message: "The request body is invalid.",
        status: 400,
      };
    }
    if (BigInt(contentLength) > BigInt(MAX_SUBMISSION_REQUEST_BODY_BYTES)) {
      await cancelRequestBody(request);
      return {
        ok: false,
        error: "request_too_large",
        message: "The request body exceeds the allowed size.",
        status: 413,
      };
    }
  }

  if (!request.body) {
    return {
      ok: false,
      error: "invalid_request",
      message: "The request body is invalid.",
      status: 400,
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_SUBMISSION_REQUEST_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // Stop reading even if the request stream has already closed.
        }
        return {
          ok: false,
          error: "request_too_large",
          message: "The request body exceeds the allowed size.",
          status: 413,
        };
      }
      chunks.push(value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // The request stream may already be closed.
    }
    return {
      ok: false,
      error: "invalid_request",
      message: "The request body is invalid.",
      status: 400,
    };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      error: "invalid_request",
      message: "The request body must be valid JSON.",
      status: 400,
    };
  }
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function resolveProblemId(slug: string): Promise<string | null> {
  // One fetch gives title, difficulty and the statement used as grading context.
  const details = await fetchLeetCodeProblemDetails(slug);
  const admin = createAuthAdminClient();
  const { error: insertError } = await admin.from("problems").upsert(
    {
      leetcode_slug: slug,
      title: details?.title ?? titleFromSlug(slug),
      description: details?.promptText ?? null,
      difficulty: details?.difficulty ?? null,
    },
    { onConflict: "leetcode_slug", ignoreDuplicates: true },
  );

  if (insertError) {
    return null;
  }

  const { data: problem, error: lookupError } = await admin
    .from("problems")
    .select("id")
    .eq("leetcode_slug", slug)
    .maybeSingle();

  if (lookupError || typeof problem?.id !== "string") {
    return null;
  }

  if (details?.promptText) {
    // Backfill rows created before statements were stored. Best effort only:
    // the evaluator fetches the statement itself if this does not happen.
    await admin
      .from("problems")
      .update({ description: details.promptText })
      .eq("id", problem.id)
      .is("description", null);
  }

  return problem.id;
}

export async function POST(request: Request) {
  let studentAccess;
  try {
    const supabase = await createClient();
    studentAccess = await getCurrentStudentAccess(supabase);
  } catch {
    await cancelRequestBody(request);
    return errorResponse(
      "authorization_failed",
      "Student access could not be verified.",
      503,
    );
  }

  if (studentAccess.status !== "allowed") {
    await cancelRequestBody(request);
    if (studentAccess.status === "unauthenticated") {
      return errorResponse(
        "unauthorized",
        "Sign in to submit a solution.",
        401,
      );
    }
    if (studentAccess.status === "forbidden") {
      return errorResponse(
        "forbidden",
        "Only enrolled students can submit solutions.",
        403,
      );
    }
    if (studentAccess.status === "not-enrolled") {
      return errorResponse(
        "student_not_enrolled",
        "Your account is not linked to an enrolled student.",
        403,
      );
    }
    return errorResponse(
      "authorization_failed",
      "Student access could not be verified.",
      503,
    );
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return errorResponse(
      bodyResult.error,
      bodyResult.message,
      bodyResult.status,
    );
  }

  const body = bodyResult.value;
  if (typeof body !== "object" || body === null) {
    return errorResponse(
      "invalid_request",
      "The request body is invalid.",
      400,
    );
  }

  // The browser never sends a transcript: the server makes it from the video.
  const { leetcodeSubmissionUrl, videoObjectKey } = body as {
    leetcodeSubmissionUrl?: unknown;
    videoObjectKey?: unknown;
  };
  if (
    typeof leetcodeSubmissionUrl !== "string" ||
    leetcodeSubmissionUrl.length > 2048 ||
    typeof videoObjectKey !== "string" ||
    videoObjectKey.length > 200
  ) {
    return errorResponse(
      "invalid_input",
      "Required submission details are missing or invalid.",
      400,
    );
  }

  const parsedUrl = parseLeetCodeProblemUrl(leetcodeSubmissionUrl);
  if (!parsedUrl) {
    return errorResponse(
      "invalid_submission_url",
      "Enter a valid HTTPS LeetCode problem or submission URL.",
      400,
    );
  }

  const videoVerification = await verifyStudentVideoObject(
    studentAccess.studentId,
    videoObjectKey,
  );
  if (!videoVerification.verified) {
    if (videoVerification.reason === "not_owned") {
      return errorResponse(
        "invalid_video_reference",
        "The video does not belong to this student.",
        403,
      );
    }
    if (videoVerification.reason === "object_not_found") {
      return errorResponse(
        "video_not_found",
        "The uploaded video could not be found in private storage.",
        404,
      );
    }
    if (videoVerification.reason === "invalid_video") {
      return errorResponse(
        "invalid_video",
        "The stored object is not an allowed video or exceeds 100 MiB.",
        422,
      );
    }
    if (videoVerification.reason === "verification_unavailable") {
      return errorResponse(
        "video_verification_unavailable",
        "The uploaded video could not be verified. Try again.",
        502,
      );
    }
    return errorResponse(
      "invalid_video_reference",
      "The video reference is invalid.",
      400,
    );
  }

  try {
    const problemId = await resolveProblemId(parsedUrl.slug);
    if (!problemId) {
      return errorResponse(
        "problem_unavailable",
        "The LeetCode problem could not be resolved. Try again.",
        503,
      );
    }

    const admin = createAuthAdminClient();

    // A retry of the same submission reuses its stored transcript, so it is
    // not transcribed (or charged) twice and cannot differ from the first try.
    const { data: existing, error: existingError } = await admin
      .from("submissions")
      .select("leetcode_submission_url,video_object_key,transcript")
      .eq("student_id", studentAccess.studentId)
      .eq("problem_id", problemId)
      .maybeSingle();
    if (existingError) {
      return errorResponse(
        "submission_unavailable",
        "The submission service is temporarily unavailable. Try again.",
        503,
      );
    }
    if (
      existing &&
      (existing.leetcode_submission_url !== parsedUrl.href ||
        existing.video_object_key !== videoObjectKey)
    ) {
      return errorResponse(
        "submission_already_exists",
        "A submission for this problem already exists with different details. The existing submission was not changed.",
        409,
      );
    }

    let transcript: string;
    if (existing && typeof existing.transcript === "string") {
      transcript = existing.transcript;
    } else {
      const transcription = await transcribeStudentVideo(
        studentAccess.studentId,
        videoObjectKey,
      );
      if (!transcription.ok) {
        return errorResponse(
          transcription.error,
          transcription.message,
          transcription.status,
        );
      }
      transcript = transcription.transcript
        .trim()
        .slice(0, MAX_SUBMISSION_TRANSCRIPT_LENGTH);
    }

    const { error } = await admin.rpc("finalize_submission", {
      p_student_id: studentAccess.studentId,
      p_problem_id: problemId,
      p_leetcode_submission_url: parsedUrl.href,
      p_video_object_key: videoObjectKey,
      p_transcript: transcript,
    });

    if (error) {
      if (error.message.includes("You have already submitted this problem")) {
        return errorResponse(
          "submission_already_exists",
          "A submission for this problem already exists with different details. The existing submission was not changed.",
          409,
        );
      }
      return errorResponse(
        "submission_failed",
        "The solution could not be submitted. Try again.",
        500,
      );
    }

    return NextResponse.json({ submitted: true });
  } catch {
    return errorResponse(
      "submission_unavailable",
      "The submission service is temporarily unavailable. Try again.",
      503,
    );
  }
}
