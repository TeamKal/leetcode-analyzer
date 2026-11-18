import assert from "node:assert/strict";
import test from "node:test";
import { isPageLocked } from "../src/lib/student/lockedPages.ts";

test("Submissions and Profile are locked", () => {
  assert.equal(isPageLocked("submissions"), true);
  assert.equal(isPageLocked("profile"), true);
});

test("Home and unknown names are never locked", () => {
  assert.equal(isPageLocked("home"), false);
  assert.equal(isPageLocked("toString"), false);
  assert.equal(isPageLocked(""), false);
});
