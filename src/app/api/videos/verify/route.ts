import { NextResponse } from "next/server";
import { verifyStudentVideoObject } from "@/lib/r2/verifyStudentVideo";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStudentAccess } from "@/lib/supabase/student";

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", 400);
  }

  const objectKey =
    typeof body === "object" && body !== null && "objectKey" in body
      ? body.objectKey
      : null;
  if (typeof objectKey !== "string" || objectKey.length > 200) {
    return errorResponse("invalid_object_key", 400);
  }

  try {
    const supabase = await createClient();
    const studentAccess = await getCurrentStudentAccess(supabase);
    if (studentAccess.status === "unauthenticated") {
      return errorResponse("unauthorized", 401);
    }
    if (studentAccess.status === "forbidden") {
      return errorResponse("forbidden", 403);
    }
    if (studentAccess.status === "not-enrolled") {
      return errorResponse("student_not_enrolled", 403);
    }
    if (studentAccess.status === "error") {
      return errorResponse("authorization_failed", 403);
    }

    const verification = await verifyStudentVideoObject(
      studentAccess.studentId,
      objectKey,
    );
    if (!verification.verified) {
      if (verification.reason === "not_owned") {
        return errorResponse("invalid_object_key", 403);
      }
      if (verification.reason === "object_not_found") {
        return errorResponse("object_not_found", 404);
      }
      if (verification.reason === "invalid_video") {
        return errorResponse("uploaded_video_invalid", 422);
      }
      if (verification.reason === "verification_unavailable") {
        return errorResponse("verification_unavailable", 502);
      }
      return errorResponse("invalid_object_key", 400);
    }

    return NextResponse.json({ verified: true, objectKey });
  } catch {
    return errorResponse("verification_unavailable", 502);
  }
}
