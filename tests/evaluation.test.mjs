import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedEvaluationCronRequest } from "../src/lib/evaluation/cronAuth.ts";
import { processOneEvaluationJob } from "../src/lib/evaluation/processor.ts";
import { validateEvaluationResponse } from "../src/lib/evaluation/validator.ts";

function validEvaluation() {
  return {
    scores: {
      problem_understanding: { score: 1.5, feedback: "Mostly clear." },
      approach: { score: 1.5, feedback: "A suitable approach." },
      reasoning: { score: 1.5, feedback: "Reasoning is explained." },
      edge_cases: { score: 0.5, feedback: "Some cases are considered." },
      complexity: { score: 0.5, feedback: "Complexity is partly stated." },
      communication: { score: 1.5, feedback: "The explanation is clear." },
    },
    feedback: "The explanation is generally sound.",
    strengths: ["Explains the approach."],
    improvements: ["State complexity explicitly."],
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
  assert.throws(() => validateEvaluationResponse(value));
});

test("rejects a missing category", () => {
  const value = validEvaluation();
  delete value.scores.reasoning;
  assert.throws(() => validateEvaluationResponse(value));
});

test("rejects non-finite scores", () => {
  for (const score of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const value = validEvaluation();
    value.scores.approach.score = score;
    assert.throws(() => validateEvaluationResponse(value));
  }
});

test("rejects scores above a category maximum", () => {
  const value = validEvaluation();
  value.scores.complexity.score = 1.01;
  assert.throws(() => validateEvaluationResponse(value));
});

test("rejects malformed strengths and improvements", () => {
  for (const field of ["strengths", "improvements"]) {
    const value = validEvaluation();
    value[field] = [" "];
    assert.throws(() => validateEvaluationResponse(value));
  }
});

test("calculates the overall score from validated categories", () => {
  const result = validateEvaluationResponse(validEvaluation());
  assert.equal(result.overallScore, 7);
  assert.equal("overall_score" in validEvaluation(), false);
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
  assert.equal(calls.completed.p_rubric_version, "v1");
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
