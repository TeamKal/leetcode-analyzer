import assert from "node:assert/strict";
import test from "node:test";
import { checkSubmissionInput } from "../src/lib/leetcode.ts";
import {
  asReviewPhase,
  canStart,
  captionFor,
  IDLE_TRACKER,
  isBusy,
  reviewPhaseFromStatus,
  REVIEW_FAILED_MESSAGE,
  stageViews,
  trackerReducer,
} from "../src/lib/submit/progress.ts";

const run = (events, from = IDLE_TRACKER) =>
  events.reduce((tracker, event) => trackerReducer(tracker, event), from);
const states = (tracker) => stageViews(tracker).map((stage) => stage.state);

// --- The submission link -----------------------------------------------------

test("a full submission link gives the problem and the submission id", () => {
  const check = checkSubmissionInput(
    " https://leetcode.com/problems/two-sum/submissions/1234567890/ ",
  );
  assert.equal(check.ok, true);
  assert.equal(check.link.slug, "two-sum");
  assert.equal(check.link.submissionId, "1234567890");
  assert.match(check.link.href, /^https:\/\/leetcode\.com\/problems\/two-sum\/submissions\/1234567890\/?$/);

  // www and a missing trailing slash are fine.
  assert.equal(
    checkSubmissionInput("https://www.leetcode.com/problems/3sum/submissions/9").ok,
    true,
  );
});

test("each kind of bad input gets its own friendly reason", () => {
  const reason = (value) => {
    const check = checkSubmissionInput(value);
    assert.equal(check.ok, false);
    assert.ok(check.message.length > 20);
    return check.reason;
  };
  assert.equal(reason(""), "empty");
  assert.equal(reason("   "), "empty");
  assert.equal(reason("1234567"), "just_a_number");
  assert.equal(reason("leetcode"), "not_a_link");
  assert.equal(reason("http://leetcode.com/problems/two-sum/submissions/1/"), "not_leetcode");
  assert.equal(reason("https://example.com/problems/two-sum/submissions/1/"), "not_leetcode");
  assert.equal(reason("https://leetcode.com:8080/problems/two-sum/submissions/1/"), "not_leetcode");
  assert.equal(reason("https://leetcode.com/problems/two-sum/"), "problem_only");
  assert.equal(reason("https://leetcode.com/submissions/detail/123456/"), "no_problem_name");
  assert.equal(reason("https://leetcode.com/contest/weekly-1/"), "invalid");
  assert.equal(reason("https://leetcode.com/problems/two-sum/submissions/abc/"), "invalid");
});

test("the messages never expose internal names", () => {
  for (const value of ["", "42", "nope", "https://leetcode.com/problems/a/", "https://x.com/"]) {
    const check = checkSubmissionInput(value);
    assert.equal(check.ok, false);
    assert.doesNotMatch(check.message, /api|slug|regex|supabase|r2|deepgram|groq/i);
  }
});

// --- Backend status -> review phase ------------------------------------------

test("backend statuses map to review phases", () => {
  assert.equal(reviewPhaseFromStatus("pending_evaluation"), "queued");
  assert.equal(reviewPhaseFromStatus("evaluating"), "reviewing");
  assert.equal(reviewPhaseFromStatus("evaluated"), "scored");
  assert.equal(reviewPhaseFromStatus("graded"), "graded");
  assert.equal(reviewPhaseFromStatus("failed"), "failed");
  assert.equal(reviewPhaseFromStatus("draft"), null);
  assert.equal(reviewPhaseFromStatus(undefined), null);
});

test("only known review phases are accepted from an API response", () => {
  for (const phase of ["queued", "reviewing", "scored", "graded", "failed"]) {
    assert.equal(asReviewPhase(phase), phase);
  }
  for (const value of [null, undefined, "", "done", "evaluated", 3, {}]) {
    assert.equal(asReviewPhase(value), null);
  }
});

// --- The tracker ---------------------------------------------------------------

test("a normal run moves through the stages in order", () => {
  assert.deepEqual(states(IDLE_TRACKER), ["pending", "pending", "pending", "pending"]);

  let t = run([{ type: "start" }]);
  assert.deepEqual(states(t), ["active", "pending", "pending", "pending"]);

  t = run([{ type: "progress", percent: 42 }], t);
  assert.equal(t.uploadPercent, 42);
  assert.match(captionFor(t), /42%/);

  t = run([{ type: "saved" }], t);
  assert.deepEqual(states(t), ["done", "active", "pending", "pending"]);
  assert.equal(t.uploadPercent, null);

  t = run([{ type: "submitted" }], t);
  assert.deepEqual(states(t), ["done", "done", "active", "pending"]);

  t = run([{ type: "review", phase: "queued" }], t);
  assert.match(captionFor(t), /waiting for its AI review/);
  t = run([{ type: "review", phase: "reviewing" }], t);
  assert.match(captionFor(t), /reading/);
  assert.deepEqual(states(t), ["done", "done", "active", "pending"]);

  t = run([{ type: "review", phase: "scored" }], t);
  assert.equal(t.phase, "complete");
  assert.deepEqual(states(t), ["done", "done", "done", "done"]);
});

test("done is only reached when the backend says the review is scored or graded", () => {
  const reviewing = run([{ type: "start" }, { type: "saved" }, { type: "submitted" }]);
  for (const phase of ["queued", "reviewing"]) {
    assert.notEqual(run([{ type: "review", phase }], reviewing).phase, "complete");
  }
  for (const phase of ["scored", "graded"]) {
    assert.equal(run([{ type: "review", phase }], reviewing).phase, "complete");
  }
});

test("a failed stage is marked, earlier stages stay done, later ones pending", () => {
  let t = run([{ type: "start" }, { type: "fail", at: "save", message: "Upload failed." }]);
  assert.deepEqual(states(t), ["failed", "pending", "pending", "pending"]);
  assert.equal(captionFor(t), "Upload failed.");

  t = run([{ type: "start" }, { type: "saved" }, { type: "fail", at: "submit", message: "No." }]);
  assert.deepEqual(states(t), ["done", "failed", "pending", "pending"]);

  t = run([{ type: "start" }, { type: "saved" }, { type: "submitted" }, { type: "review", phase: "failed" }]);
  assert.deepEqual(states(t), ["done", "done", "failed", "pending"]);
  assert.equal(captionFor(t), REVIEW_FAILED_MESSAGE);
});

test("events out of order are ignored, so a stage can never be skipped", () => {
  assert.deepEqual(run([{ type: "saved" }]), IDLE_TRACKER);
  assert.deepEqual(run([{ type: "submitted" }]), IDLE_TRACKER);
  assert.deepEqual(run([{ type: "review", phase: "scored" }]), IDLE_TRACKER);
  const saving = run([{ type: "start" }]);
  assert.equal(run([{ type: "review", phase: "scored" }], saving).phase, "saving");
  assert.equal(run([{ type: "submitted" }], saving).phase, "saving");
  // A percentage only counts while saving, and is clamped.
  assert.equal(run([{ type: "progress", percent: 50 }]).uploadPercent, null);
  assert.equal(run([{ type: "progress", percent: 250 }], saving).uploadPercent, 100);
  assert.equal(run([{ type: "progress", percent: -4 }], saving).uploadPercent, 0);
});

test("the slow notice only applies while reviewing and says the page can be left", () => {
  const reviewing = run([{ type: "start" }, { type: "saved" }, { type: "submitted" }]);
  const slow = run([{ type: "slow" }], reviewing);
  assert.equal(slow.slow, true);
  assert.match(captionFor(slow), /taking longer than usual/);
  assert.equal(run([{ type: "slow" }], IDLE_TRACKER).slow, false);
});

test("the submit button only starts a run once, and only with a link and a recording", () => {
  const ready = { hasLink: true, hasRecording: true };
  assert.equal(canStart(IDLE_TRACKER, ready), true);
  assert.equal(canStart(IDLE_TRACKER, { hasLink: false, hasRecording: true }), false);
  assert.equal(canStart(IDLE_TRACKER, { hasLink: true, hasRecording: false }), false);

  for (const events of [
    [{ type: "start" }],
    [{ type: "start" }, { type: "saved" }],
    [{ type: "start" }, { type: "saved" }, { type: "submitted" }],
    [{ type: "start" }, { type: "saved" }, { type: "submitted" }, { type: "review", phase: "scored" }],
  ]) {
    assert.equal(canStart(run(events), ready), false);
  }
  // After a failure the student may try again.
  assert.equal(canStart(run([{ type: "start" }, { type: "fail", at: "save", message: "x" }]), ready), true);
});

test("busy means saving, submitting or reviewing", () => {
  assert.equal(isBusy(IDLE_TRACKER), false);
  assert.equal(isBusy(run([{ type: "start" }])), true);
  assert.equal(isBusy(run([{ type: "start" }, { type: "fail", at: "save", message: "x" }])), false);
});
