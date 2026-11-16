import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isKeyInStudentPrefix } from "@/lib/r2/objectKey";
import { createR2Client, getR2BucketName } from "@/lib/r2/server";

const READ_URL_TTL_SECONDS = 600;

// Short-lived read link for exactly one validated student video object.
export async function createStudentVideoReadUrl(
  studentId: string,
  objectKey: string,
): Promise<string> {
  if (!isKeyInStudentPrefix(studentId, objectKey)) {
    throw new Error("Invalid object key.");
  }
  return getSignedUrl(
    createR2Client(),
    new GetObjectCommand({ Bucket: getR2BucketName(), Key: objectKey }),
    { expiresIn: READ_URL_TTL_SECONDS },
  );
}
