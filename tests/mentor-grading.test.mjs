import assert from "node:assert/strict";
import test from "node:test";
import {
  describeGradeError,
  describeReviewFlag,
  firstOf,
  formatScore,
  getGradingState,
  matchesFilter,
  parseListFilter,
  parseScoreInput,
  readCategoryScores,
} from "../src/lib/mentor/grading.ts";

test("getGradingState maps statuses and hides drafts", () => {
  assert.equal(getGradingState("evaluated"), "needs_grading");
  assert.equal(getGradingState("pending_evaluation"), "waiting");
  assert.equal(getGradingState("evaluating"), "waiting");
  assert.equal(getGradingState("graded"), "graded");
  assert.equal(getGradingState("failed"), "failed");
  assert.equal(getGradingState("draft"), null);
  assert.equal(getGradingState("uploading"), null);
});

test("filters pick the right states", () => {
  assert.equal(parseListFilter(undefined), "needs");
  assert.equal(parseListFilter("graded"), "graded");
  assert.equal(parseListFilter("nonsense"), "needs");
  assert.equal(matchesFilter("needs_grading", "needs"), true);
  assert.equal(matchesFilter("waiting", "needs"), true);
  assert.equal(matchesFilter("graded", "needs"), false);
  assert.equal(matchesFilter("graded", "graded"), true);
  assert.equal(matchesFilter("failed", "all"), true);
  assert.equal(matchesFilter(null, "all"), false);
});

test("parseScoreInput accepts only 0 to 10 with up to two decimals", () => {
  assert.equal(parseScoreInput("7"), 7);
  assert.equal(parseScoreInput(" 7.5 "), 7.5);
  assert.equal(parseScoreInput("10"), 10);
  assert.equal(parseScoreInput("0"), 0);
  assert.equal(parseScoreInput("10.01"), null);
  assert.equal(parseScoreInput("11"), null);
  assert.equal(parseScoreInput("-1"), null);
  assert.equal(parseScoreInput("7.555"), null);
  assert.equal(parseScoreInput("abc"), null);
  assert.equal(parseScoreInput(""), null);
  assert.equal(parseScoreInput(7), null);
});

test("formatScore handles numbers, strings and missing values", () => {
  assert.equal(formatScore(7), "7");
  assert.equal(formatScore("7.25"), "7.3");
  assert.equal(formatScore(null), "–");
  assert.equal(formatScore("x"), "–");
});

test("readCategoryScores keeps order and skips malformed entries", () => {
  const scores = readCategoryScores(
    {
      approach: { score: 1.5, feedback: "ok", evidence: ["quote", 3] },
      reasoning: "bad",
      problem_understanding: { score: 2 },
    },
    ["problem_understanding", "approach", "reasoning"],
  );
  assert.deepEqual(
    scores.map((entry) => entry.category),
    ["problem_understanding", "approach"],
  );
  assert.deepEqual(scores[1].evidence, ["quote"]);
  assert.deepEqual(readCategoryScores(null, ["approach"]), []);
});

test("firstOf accepts an object or a list", () => {
  assert.deepEqual(firstOf({ a: 1 }), { a: 1 });
  assert.deepEqual(firstOf([{ a: 1 }]), { a: 1 });
  assert.equal(firstOf([]), null);
  assert.equal(firstOf(null), null);
});

test("error and flag messages are friendly", () => {
  assert.match(describeGradeError("This submission has already been graded"), /already been graded/);
  assert.match(describeGradeError("Submission not found, not evaluated, or access denied"), /cannot be graded/);
  assert.match(describeGradeError("boom"), /could not be saved/);
  assert.equal(describeReviewFlag("wrong_problem"), "May be about a different problem");
  assert.equal(describeReviewFlag("some_new_flag"), "some new flag");
});
