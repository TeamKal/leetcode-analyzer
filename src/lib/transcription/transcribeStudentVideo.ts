import "server-only";

import { createStudentVideoReadUrl } from "@/lib/r2/presignRead";
import { verifyStudentVideoObject } from "@/lib/r2/verifyStudentVideo";
import { createAuthAdminClient } from "@/lib/supabase/admin";
import { transcribeWithDeepgram } from "@/lib/transcription/deepgram";
import { runServerTranscription } from "@/lib/transcription/serverFlow";

// Slots are reserved before the provider call, so failed attempts count too.
const DAILY_TRANSCRIPTION_LIMIT = 10;

export type StudentTranscriptionResult =
  | { ok: true; transcript: string }
  | { ok: false; status: number; error: string; message: string };

/**
 * Transcribes one of the student's own videos on the server. The caller has
 * already taken the student id from the session; the video key must be in that
 * student's R2 prefix, and the per-student daily limit applies before any
 * Deepgram call. The transcript is returned to server code only.
 */
export async function transcribeStudentVideo(
  studentId: string,
  videoObjectKey: string,
): Promise<StudentTranscriptionResult> {
  const result = await runServerTranscription(
    { videoObjectKey },
    {
      getAccess: async () => ({ status: "allowed", studentId }),
      verifyVideo: verifyStudentVideoObject,
      reserveSlot: async (id, objectKey) => {
        const admin = createAuthAdminClient();
        const { data, error } = await admin.rpc("reserve_transcription_slot", {
          p_student_id: id,
          p_object_key: objectKey,
          p_daily_limit: DAILY_TRANSCRIPTION_LIMIT,
        });
        if (error || typeof data !== "boolean") {
          throw new Error("Transcription limiter unavailable.");
        }
        return data;
      },
      // The helper re-checks the student prefix as a last line of defense.
      presignRead: createStudentVideoReadUrl,
      transcribe: async (audioUrl) => {
        const outcome = await transcribeWithDeepgram({
          audioUrl,
          apiKey: process.env.DEEPGRAM_API_KEY,
        });
        if (!outcome.ok && outcome.reason === "misconfigured") {
          console.error("Deepgram is not configured correctly.");
        } else if (!outcome.ok && outcome.reason === "unavailable") {
          console.error("Deepgram transcription is unavailable.");
        }
        return outcome.ok
          ? { ok: true, transcript: outcome.transcript }
          : { ok: false, reason: outcome.reason };
      },
    },
  );

  if ("transcript" in result.body) {
    return { ok: true, transcript: result.body.transcript };
  }

  const { error } = result.body;
  const message =
    error === "limit_reached"
      ? "You have reached today's limit for submissions. Please try again tomorrow."
      : error === "no_speech"
        ? "We could not hear any speech in your recording. Check your microphone and record again."
        : "We could not process your recording. Please try again.";
  return { ok: false, status: result.status, error, message };
}
