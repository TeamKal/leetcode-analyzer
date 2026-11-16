// Orchestrates one server-side transcription request. All side effects are
// injected so authorization, ownership, rate limiting and failure mapping can
// be unit-tested without Next.js, Supabase, R2 or Deepgram.

export type StudentAccessResult =
  | { status: "allowed"; studentId: string }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "not-enrolled" }
  | { status: "error" };

export type VideoVerification =
  | { verified: true }
  | {
      verified: false;
      reason:
        | "invalid_object_key"
        | "not_owned"
        | "object_not_found"
        | "invalid_video"
        | "verification_unavailable";
    };

export type TranscriptionOutcome =
  | { ok: true; transcript: string }
  | {
      ok: false;
      reason:
        | "misconfigured"
        | "unavailable"
        | "rejected"
        | "timeout"
        | "empty";
    };

export type ServerTranscriptionDependencies = {
  getAccess: () => Promise<StudentAccessResult>;
  verifyVideo: (
    studentId: string,
    objectKey: string,
  ) => Promise<VideoVerification>;
  // Returns true when a slot was reserved, false when the limit is reached.
  reserveSlot: (studentId: string, objectKey: string) => Promise<boolean>;
  presignRead: (studentId: string, objectKey: string) => Promise<string>;
  transcribe: (audioUrl: string) => Promise<TranscriptionOutcome>;
};

export type ServerTranscriptionResponse = {
  status: number;
  body: { transcript: string } | { error: string; message: string };
};

function failure(
  status: number,
  error: string,
  message: string,
): ServerTranscriptionResponse {
  return { status, body: { error, message } };
}

export async function runServerTranscription(
  body: unknown,
  dependencies: ServerTranscriptionDependencies,
): Promise<ServerTranscriptionResponse> {
  const access = await dependencies.getAccess().catch(() => ({
    status: "error" as const,
  }));
  if (access.status === "unauthenticated") {
    return failure(401, "unauthorized", "Sign in to continue.");
  }
  if (access.status === "forbidden") {
    return failure(403, "forbidden", "This account cannot transcribe videos.");
  }
  if (access.status === "not-enrolled") {
    return failure(403, "student_not_enrolled", "This account is not enrolled.");
  }
  if (access.status !== "allowed") {
    return failure(403, "authorization_failed", "Access could not be verified.");
  }

  const videoObjectKey =
    typeof body === "object" && body !== null
      ? (body as { videoObjectKey?: unknown }).videoObjectKey
      : undefined;
  if (typeof videoObjectKey !== "string" || videoObjectKey.length === 0) {
    return failure(400, "invalid_request", "The request is invalid.");
  }

  // Identity always comes from the session, never from the request body.
  const verification = await dependencies
    .verifyVideo(access.studentId, videoObjectKey)
    .catch(() => ({
      verified: false as const,
      reason: "verification_unavailable" as const,
    }));
  if (!verification.verified) {
    if (
      verification.reason === "invalid_object_key" ||
      verification.reason === "not_owned"
    ) {
      return failure(403, "forbidden", "That video is not available.");
    }
    if (verification.reason === "object_not_found") {
      return failure(404, "video_not_found", "The video was not found.");
    }
    if (verification.reason === "invalid_video") {
      return failure(400, "invalid_video", "The video file is not supported.");
    }
    return failure(503, "unavailable", "Transcription is unavailable.");
  }

  let reserved: boolean;
  try {
    reserved = await dependencies.reserveSlot(access.studentId, videoObjectKey);
  } catch {
    // Fail closed: without a working limiter, spend must not be possible.
    return failure(503, "unavailable", "Transcription is unavailable.");
  }
  if (!reserved) {
    return failure(
      429,
      "limit_reached",
      "Daily server transcription limit reached.",
    );
  }

  let audioUrl: string;
  try {
    audioUrl = await dependencies.presignRead(access.studentId, videoObjectKey);
  } catch {
    return failure(503, "unavailable", "Transcription is unavailable.");
  }

  let outcome: TranscriptionOutcome;
  try {
    outcome = await dependencies.transcribe(audioUrl);
  } catch {
    return failure(503, "unavailable", "Transcription is unavailable.");
  }

  if (outcome.ok) {
    return { status: 200, body: { transcript: outcome.transcript } };
  }
  if (outcome.reason === "empty") {
    return failure(
      422,
      "no_speech",
      "No speech was recognized. Check that the recording is audible.",
    );
  }
  if (outcome.reason === "rejected") {
    return failure(502, "unprocessable", "The video could not be transcribed.");
  }
  return failure(503, "unavailable", "Transcription is unavailable.");
}
