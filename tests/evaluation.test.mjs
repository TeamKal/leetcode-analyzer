import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedEvaluationCronRequest } from "../src/lib/evaluation/cronAuth.ts";
import { EVALUATION_SYSTEM_PROMPT } from "../src/lib/evaluation/prompt.ts";
import { processOneEvaluationJob } from "../src/lib/evaluation/processor.ts";
import { validateEvaluationResponse } from "../src/lib/evaluation/validator.ts";

const TRANSCRIPT =
  "I would use a hash map to store the complement of each number while scanning the array once and return the indices as soon as the complement is found.";

function validEvaluation() {
  return {
    scores: {
      problem_understanding: { score: 1.5, feedback: "Mostly clear.", evidence: [] },
      approach: { score: 1.5, feedback: "A suitable approach.", evidence: [] },
      reasoning: { score: 1.5, feedback: "Reasoning is explained.", evidence: [] },
      edge_cases: { score: 0.5, feedback: "Some cases are considered.", evidence: [] },
      complexity: { score: 0.5, feedback: "Complexity is partly stated.", evidence: [] },
      communication: { score: 1.5, feedback: "The explanation is clear.", evidence: [] },
    },
    feedback: "The explanation is generally sound.",
    strengths: ["Explains the approach."],
    improvements: ["State complexity explicitly."],
    review_flags: [],
  };
}

function claimedJob() {
  return {
    job_id: "job-1",
    submission_id: "submission-1",
    attempt_number: 1,
    leetcode_submission_url: "https://leetcode.com/problems/two-sum/",
    video_object_key: "students/student-1/videos/video-1.webm",
    transcript: "I would use a hash map.",
    leetcode_slug: "two-sum",
    problem_title: "Two Sum",
  };
}

function processorDependencies(overrides = {}) {
  const calls = {
    recoveredTimeout: null,
    claimedWorker: null,
    evaluatedJob: null,
    renewed: null,
    completed: null,
    failed: null,
    failureLogCount: 0,
  };
  const dependencies = {
    recoverStaleJobs: async (timeout) => {
      calls.recoveredTimeout = timeout;
      return { data: 0, error: null };
    },
    claimJob: async (workerId) => {
      calls.claimedWorker = workerId;
      return { data: claimedJob(), error: null };
    },
    evaluate: async (job) => {
      calls.evaluatedJob = job;
      return { modelName: "test-model", response: validEvaluation() };
    },
    validate: validateEvaluationResponse,
    renewLease: async (jobId, workerId) => {
      calls.renewed = { jobId, workerId };
      return { data: true, error: null };
    },
    completeJob: async (arguments_) => {
      calls.completed = arguments_;
      return { data: null, error: null };
    },
    failJob: async (jobId, workerId, sanitizedError) => {
      calls.failed = { jobId, workerId, sanitizedError };
      return { data: null, error: null };
    },
    onFailureRecordingError: () => {
      calls.failureLogCount += 1;
    },
    ...overrides,
  };
  return { calls, dependencies };
}

test("rejects an invalid category score", () => {
  const value = validEvaluation();
  value.scores.edge_cases.score = -0.1;
  assert.throws(() => validateEvaluationResponse(value, TRANSCRIPT));
});

test("rejects a missing category", () => {
  const value = validEvaluation();
  delete value.scores.reasoning;
  assert.throws(() => validateEvaluationResponse(value, TRANSCRIPT));
});

test("rejects non-finite scores", () => {
  for (const score of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const value = validEvaluation();
    value.scores.approach.score = score;
    assert.throws(() => validateEvaluationResponse(value, TRANSCRIPT));
  }
});

test("caps scores above a category maximum and flags them", () => {
  const value = validEvaluation();
  value.scores.complexity.score = 2;
  const result = validateEvaluationResponse(value, TRANSCRIPT);

  assert.equal(result.scores.complexity.score, 1);
  assert.ok(result.reviewFlags.includes("score_adjusted"));
  // The backend total uses the capped score, never the model's number.
  assert.equal(result.overallScore, 1.5 + 1.5 + 1.5 + 0.5 + 1 + 1.5);
});

test("does not flag scores within their maximum", () => {
  const result = validateEvaluationResponse(validEvaluation(), TRANSCRIPT);
  assert.ok(!result.reviewFlags.includes("score_adjusted"));
});

test("rejects malformed strengths and improvements", () => {
  for (const field of ["strengths", "improvements"]) {
    const value = validEvaluation();
    value[field] = [" "];
    assert.throws(() => validateEvaluationResponse(value, TRANSCRIPT));
  }
});

test("calculates the overall score from validated categories", () => {
  const result = validateEvaluationResponse(validEvaluation(), TRANSCRIPT);
  assert.equal(result.overallScore, 7);
  assert.equal("overall_score" in validEvaluation(), false);
});

test("prompt awards full complexity credit only for explained time and space", () => {
  assert.match(
    EVALUATION_SYSTEM_PROMPT,
    /1\.00: Both time and auxiliary space are correct and reasonably justified\./,
  );
  assert.match(
    EVALUATION_SYSTEM_PROMPT,
    /Do not award full complexity credit when either time or auxiliary space is explicitly missing\./,
  );
});

test("prompt assigns partial credit for time-only complexity explanations", () => {
  assert.match(
    EVALUATION_SYSTEM_PROMPT,
    /0\.50: Time or auxiliary space complexity is correct and reasonably explained, but the other is missing or unclear\./,
  );
});

test("prompt assigns quarter credit to tentative or unsupported complexity claims", () => {
  assert.match(
    EVALUATION_SYSTEM_PROMPT,
    /0\.25: A vague, tentative, or unsupported complexity claim; the student acknowledges uncertainty or cannot explain the claim\./,
  );
});

test("prompt assigns zero to absent or materially incorrect complexity claims", () => {
  assert.match(
    EVALUATION_SYSTEM_PROMPT,
    /0\.00: No meaningful complexity discussion, or materially incorrect complexity claims\./,
  );
});

test("complexity band scores remain accepted by the existing validator", () => {
  for (const score of [1, 0.5, 0.25, 0]) {
    const value = validEvaluation();
    value.scores.complexity.score = score;
    assert.equal(
      validateEvaluationResponse(value, TRANSCRIPT).scores.complexity.score,
      score,
    );
  }
});

test("rejects absent and invalid Cron secrets", () => {
  assert.equal(isAuthorizedEvaluationCronRequest(null, "secret"), false);
  assert.equal(
    isAuthorizedEvaluationCronRequest("Bearer wrong", "secret"),
    false,
  );
  assert.equal(
    isAuthorizedEvaluationCronRequest("Bearer secret", undefined),
    false,
  );
  assert.equal(
    isAuthorizedEvaluationCronRequest("Bearer secret", "secret"),
    true,
  );
});

test("returns no_jobs for an empty queue", async () => {
  const { calls, dependencies } = processorDependencies({
    claimJob: async () => ({ data: null, error: null }),
  });
  const result = await processOneEvaluationJob("worker-1", dependencies);

  assert.deepEqual(result, { status: "no_jobs" });
  assert.equal(calls.recoveredTimeout, 15);
  assert.equal(calls.completed, null);
});

test("maps the exact claim RPC row to evaluation input fields", async () => {
  const { calls, dependencies } = processorDependencies();
  const result = await processOneEvaluationJob("worker-1", dependencies);

  assert.deepEqual(result, { status: "completed", overallScore: 7 });
  assert.equal(calls.evaluatedJob.jobId, "job-1");
  assert.equal(calls.evaluatedJob.transcript, "I would use a hash map.");
  assert.equal(calls.evaluatedJob.problemTitle, "Two Sum");
  assert.equal(calls.evaluatedJob.problemSlug, "two-sum");
  assert.equal(
    calls.evaluatedJob.videoObjectKey,
    "students/student-1/videos/video-1.webm",
  );
});

test("records a Groq failure through the failure RPC", async () => {
  const { calls, dependencies } = processorDependencies({
    evaluate: async () => {
      throw new Error("provider error containing sensitive details");
    },
  });
  const result = await processOneEvaluationJob("worker-1", dependencies);

  assert.deepEqual(result, { status: "failed" });
  assert.equal(calls.failed.jobId, "job-1");
  assert.equal(calls.failed.workerId, "worker-1");
  assert.equal(calls.failed.sanitizedError, "Evaluation processing failed.");
  assert.equal(calls.completed, null);
});

test("completes only after successful lease renewal and completion RPC", async () => {
  const { calls, dependencies } = processorDependencies();
  const result = await processOneEvaluationJob("worker-1", dependencies);

  assert.deepEqual(result, { status: "completed", overallScore: 7 });
  assert.deepEqual(calls.renewed, { jobId: "job-1", workerId: "worker-1" });
  assert.equal(calls.completed.p_job_id, "job-1");
  assert.equal(calls.completed.p_worker_id, "worker-1");
  assert.equal(calls.completed.p_rubric_version, "v2");
  assert.ok(Array.isArray(calls.completed.p_review_flags));
  assert.equal(calls.completed.p_overall_score, 7);
  assert.equal(calls.failed, null);
});

test("does not save after lease renewal reports ownership loss", async () => {
  const { calls, dependencies } = processorDependencies({
    renewLease: async () => ({ data: false, error: null }),
  });
  const result = await processOneEvaluationJob("worker-1", dependencies);

  assert.deepEqual(result, { status: "lease_lost" });
  assert.equal(calls.completed, null);
  assert.equal(calls.failed, null);
});

test("does not report success or fail the job when completion is uncertain", async () => {
  const { calls, dependencies } = processorDependencies({
    completeJob: async () => ({ data: null, error: new Error("uncertain") }),
  });
  const result = await processOneEvaluationJob("worker-1", dependencies);

  assert.deepEqual(result, { status: "completion_uncertain" });
  assert.equal(calls.failed, null);
});

test("does not report success when the completion RPC returns false", async () => {
  const { calls, dependencies } = processorDependencies({
    completeJob: async () => ({ data: false, error: null }),
  });
  const result = await processOneEvaluationJob("worker-1", dependencies);

  assert.deepEqual(result, { status: "completion_uncertain" });
  assert.equal(calls.failed, null);
});

test("classifies failures into safe, fixed reasons", async () => {
  const { classifyEvaluationFailure } = await import(
    "../src/lib/evaluation/processor.ts"
  );

  assert.match(classifyEvaluationFailure({ status: 429, message: "secret" }), /rate limit/);
  assert.match(classifyEvaluationFailure({ status: 401 }), /credentials/);
  assert.match(classifyEvaluationFailure({ status: 503 }), /temporary problem/);
  assert.match(classifyEvaluationFailure({ status: 400 }), /rejected the request/);
  assert.match(classifyEvaluationFailure({ status: 413 }), /too long/);
  assert.match(classifyEvaluationFailure({ name: "APIConnectionTimeoutError" }), /too long/);
  assert.match(classifyEvaluationFailure(new Error("GROQ_API_KEY is not configured.")), /not set up/);
  assert.match(classifyEvaluationFailure(new Error("Groq returned malformed JSON.")), /unexpected format/);
  assert.match(classifyEvaluationFailure(new Error("Invalid approach score.")), /unexpected format/);
  assert.match(classifyEvaluationFailure(new Error("Problem lookup failed.")), /problem details/);

  // Unknown errors never leak their text.
  const unknown = classifyEvaluationFailure(new Error("provider error containing sensitive details"));
  assert.equal(unknown, "Evaluation processing failed.");
  assert.doesNotMatch(classifyEvaluationFailure({ status: 429, message: "secret" }), /secret/);
  assert.equal(classifyEvaluationFailure(null), "Evaluation processing failed.");
});
