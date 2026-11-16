import { NextResponse } from "next/server";
import { createStudentVideoReadUrl } from "@/lib/r2/presignRead";
import { verifyStudentVideoObject } from "@/lib/r2/verifyStudentVideo";
import { createAuthAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStudentAccess } from "@/lib/supabase/student";
import { transcribeWithDeepgram } from "@/lib/transcription/deepgram";
import { runServerTranscription } from "@/lib/transcription/serverFlow";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_REQUEST_BODY_BYTES = 4096;
// Slots are reserved before the provider call, so failed attempts count too.
const DAILY_TRANSCRIPTION_LIMIT = 10;

function invalidRequest() {
  return NextResponse.json(
    { error: "invalid_request", message: "The request is invalid." },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) ||
      Number(contentLength) > MAX_REQUEST_BODY_BYTES)
  ) {
    return invalidRequest();
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_REQUEST_BODY_BYTES) return invalidRequest();
    body = JSON.parse(text);
  } catch {
    return invalidRequest();
  }

  const result = await runServerTranscription(body, {
    getAccess: async () => {
      const supabase = await createClient();
      return getCurrentStudentAccess(supabase);
    },
    verifyVideo: verifyStudentVideoObject,
    reserveSlot: async (studentId, objectKey) => {
      const admin = createAuthAdminClient();
      const { data, error } = await admin.rpc("reserve_transcription_slot", {
        p_student_id: studentId,
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
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
