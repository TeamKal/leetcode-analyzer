import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import {
  isSupportedVideoType,
  isValidVideoSize,
  normalizeVideoMimeType,
} from "@/lib/r2/constants";
import { createR2Client, getR2BucketName } from "@/lib/r2/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStudentAccess } from "@/lib/supabase/student";

const MAX_UPLOAD_URL_AGE_SECONDS = 300;

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

  if (typeof body !== "object" || body === null) {
    return errorResponse("invalid_request", 400);
  }

  const { contentType, fileSize } = body as {
    contentType?: unknown;
    fileSize?: unknown;
  };
  const normalizedContentType = normalizeVideoMimeType(contentType);
  if (!normalizedContentType || !isValidVideoSize(fileSize)) {
    return errorResponse("unsupported_video", 400);
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

    const extension = normalizedContentType === "video/mp4" ? "mp4" : "webm";
    const objectKey = `students/${studentAccess.studentId}/videos/${randomUUID()}.${extension}`;
    const command = new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: objectKey,
      ContentType: normalizedContentType,
      ContentLength: fileSize,
      IfNoneMatch: "*",
    });
    const uploadUrl = await getSignedUrl(createR2Client(), command, {
      expiresIn: MAX_UPLOAD_URL_AGE_SECONDS,
      signableHeaders: new Set([
        "content-length",
        "content-type",
        "if-none-match",
      ]),
    });

    return NextResponse.json({
      uploadUrl,
      objectKey,
      contentLength: fileSize,
      headers: {
        "Content-Type": normalizedContentType,
        "If-None-Match": "*",
      },
    });
  } catch {
    return errorResponse("upload_unavailable", 503);
  }
}
