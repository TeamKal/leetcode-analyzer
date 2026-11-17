import assert from "node:assert/strict";
import test from "node:test";
import {
  getStudentStatus,
  isUuid,
  STUDENT_STATUS_HINTS,
  STUDENT_STATUS_LABELS,
} from "../src/lib/student/status.ts";

test("getStudentStatus maps database statuses for students", () => {
  assert.equal(getStudentStatus("pending_evaluation"), "scoring");
  assert.equal(getStudentStatus("evaluating"), "scoring");
  assert.equal(getStudentStatus("evaluated"), "awaiting_mentor");
  assert.equal(getStudentStatus("graded"), "graded");
  assert.equal(getStudentStatus("failed"), "failed");
});

test("drafts and uploads are not shown to students", () => {
  for (const status of ["draft", "uploading", "uploaded", "transcribing", "ready_to_submit", ""]) {
    assert.equal(getStudentStatus(status), null);
  }
});

test("every status has a label and a hint", () => {
  for (const key of ["scoring", "awaiting_mentor", "graded", "failed"]) {
    assert.ok(STUDENT_STATUS_LABELS[key]);
    assert.ok(STUDENT_STATUS_HINTS[key]);
  }
});

test("isUuid accepts uuids only", () => {
  assert.equal(isUuid("1f9511be-187d-47f8-83aa-2fa62d0783fb"), true);
  assert.equal(isUuid("nope"), false);
  assert.equal(isUuid(5), false);
});
