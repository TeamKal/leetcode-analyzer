import assert from "node:assert/strict";
import test from "node:test";
import { BLOCKED_FLAG, canBeBlocked, hasBlockedRow } from "../src/lib/flags/blocked.ts";

test("only students can be blocked", () => {
  assert.equal(canBeBlocked("student"), true);
  for (const role of ["admin", "mentor", "", null, undefined, "Student"]) {
    assert.equal(canBeBlocked(role), false);
  }
});

test("a blocked row is recognised, anything else is not", () => {
  assert.equal(hasBlockedRow([{ flag: BLOCKED_FLAG }]), true);
  assert.equal(hasBlockedRow([{ flag: "ui_extras" }, { flag: BLOCKED_FLAG }]), true);
  assert.equal(hasBlockedRow([{ flag: "ui_extras" }]), false);
  assert.equal(hasBlockedRow([]), false);
  assert.equal(hasBlockedRow(null), false);
  assert.equal(hasBlockedRow("blocked"), false);
});
