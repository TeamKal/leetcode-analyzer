import "server-only";

import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { isValidVideoSize, normalizeVideoMimeType } from "@/lib/r2/constants";
import { createR2Client, getR2BucketName } from "@/lib/r2/server";

const OBJECT_KEY_PATTERN =
  /^students\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/videos\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(mp4|webm)$/i;

export type StudentVideoVerification =
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

export async function verifyStudentVideoObject(
  studentId: string,
  objectKey: string,
): Promise<StudentVideoVerification> {
  const match = OBJECT_KEY_PATTERN.exec(objectKey);
  if (!match) {
    return { verified: false, reason: "invalid_object_key" };
  }
  if (match[1].toLowerCase() !== studentId.toLowerCase()) {
    return { verified: false, reason: "not_owned" };
  }

  try {
    const object = await createR2Client().send(
      new HeadObjectCommand({
        Bucket: getR2BucketName(),
        Key: objectKey,
      }),
    );

    if (
      !isValidVideoSize(object.ContentLength) ||
      !normalizeVideoMimeType(object.ContentType)
    ) {
      return { verified: false, reason: "invalid_video" };
    }

    return { verified: true };
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "$metadata" in error
        ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
        : undefined;
    if (status === 404) {
      return { verified: false, reason: "object_not_found" };
    }
    return { verified: false, reason: "verification_unavailable" };
  }
}
