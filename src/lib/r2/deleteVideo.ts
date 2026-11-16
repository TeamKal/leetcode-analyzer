import "server-only";

import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { isKeyInStudentPrefix } from "@/lib/r2/objectKey";
import { createR2Client, getR2BucketName } from "@/lib/r2/server";

export type DeleteStudentVideoResult =
  | { status: "deleted" }
  | { status: "invalid_key" }
  | { status: "unavailable" };

/**
 * Deletes exactly one validated student video object. R2 (S3 semantics)
 * returns success for an already-absent key, which is treated as "deleted"
 * so retries after a partial failure converge.
 */
export async function deleteStudentVideoObject(
  studentId: string,
  objectKey: string,
): Promise<DeleteStudentVideoResult> {
  if (!isKeyInStudentPrefix(studentId, objectKey)) {
    return { status: "invalid_key" };
  }

  try {
    await createR2Client().send(
      new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: objectKey }),
    );
    return { status: "deleted" };
  } catch {
    // Never surface SDK or provider error text.
    return { status: "unavailable" };
  }
}
