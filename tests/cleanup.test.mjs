import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedCleanupCronRequest } from "../src/lib/cleanup/cronAuth.ts";
import {
  isKeyInStudentPrefix,
  parseStudentVideoKey,
} from "../src/lib/r2/objectKey.ts";

const STUDENT = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const VIDEO = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const KEY = `students/${STUDENT}/videos/${VIDEO}.webm`;

test("cleanup cron auth accepts only the exact bearer secret", () => {
  assert.equal(isAuthorizedCleanupCronRequest("Bearer s3cret", "s3cret"), true);
  assert.equal(isAuthorizedCleanupCronRequest("Bearer wrong!", "s3cret"), false);
  assert.equal(isAuthorizedCleanupCronRequest("Bearer s3cre", "s3cret"), false);
  assert.equal(isAuthorizedCleanupCronRequest("s3cret", "s3cret"), false);
  assert.equal(isAuthorizedCleanupCronRequest(null, "s3cret"), false);
  assert.equal(isAuthorizedCleanupCronRequest("Bearer s3cret", undefined), false);
  assert.equal(isAuthorizedCleanupCronRequest("Bearer s3cret", ""), false);
});

test("object key parser accepts only canonical student video keys", () => {
  assert.deepEqual(parseStudentVideoKey(KEY), {
    studentId: STUDENT,
    videoId: VIDEO,
  });
  assert.ok(parseStudentVideoKey(`students/${STUDENT}/videos/${VIDEO}.mp4`));

  const bad = [
    "",
    null,
    undefined,
    42,
    `/${KEY}`,
    `${KEY}/`,
    `${KEY}.exe`,
    `students/${STUDENT}/videos/../videos/${VIDEO}.webm`,
    `students/${STUDENT}/videos/${VIDEO}.mov`,
    `students/${STUDENT}/${VIDEO}.webm`,
    `students/${STUDENT}/videos/`,
    `students/*/videos/${VIDEO}.webm`,
    `students/${STUDENT}/videos/${VIDEO}.webm\n`,
    `students/${STUDENT.toUpperCase()}/videos/${VIDEO}.webm`,
    `students/not-a-uuid/videos/${VIDEO}.webm`,
    "x".repeat(500),
  ];
  for (const key of bad) {
    assert.equal(parseStudentVideoKey(key), null, String(key));
  }
});

test("prefix check requires the key to belong to the given student", () => {
  assert.equal(isKeyInStudentPrefix(STUDENT, KEY), true);
  assert.equal(isKeyInStudentPrefix(STUDENT.toUpperCase(), KEY), true);
  assert.equal(
    isKeyInStudentPrefix("11111111-1111-4111-8111-111111111111", KEY),
    false,
  );
  assert.equal(isKeyInStudentPrefix(STUDENT, "garbage"), false);
  assert.equal(isKeyInStudentPrefix(undefined, KEY), false);
});
