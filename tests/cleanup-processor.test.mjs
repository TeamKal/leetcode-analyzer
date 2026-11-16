import assert from "node:assert/strict";
import test from "node:test";
import { processOneVideoCleanupJob } from "../src/lib/cleanup/processor.ts";

const STUDENT = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const VIDEO = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const OTHER_VIDEO = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const KEY = `students/${STUDENT}/videos/${VIDEO}.webm`;
const NOW = new Date("2026-12-01T00:00:00Z");

const BASE_CONTEXT = {
  student_id: STUDENT,
  video_object_key: KEY,
  submission_status: "evaluated",
  video_delete_after: "2026-11-01T00:00:00Z",
  video_deleted_at: null,
};

function claimRow() {
  return { job_id: "job-1", submission_id: "sub-1", object_key: KEY, attempt_number: 1 };
}

function deps(overrides = {}) {
  const calls = { delete: [], complete: 0, fail: [], renew: 0 };
  const base = {
    recoverStaleJobs: async () => ({ data: 0, error: null }),
    claimJob: async () => ({ data: [claimRow()], error: null }),
    getJobContext: async () => ({ data: [BASE_CONTEXT], error: null }),
    renewLease: async () => {
      calls.renew += 1;
      return { data: true, error: null };
    },
    deleteObject: async (studentId, key) => {
      calls.delete.push([studentId, key]);
      return { status: "deleted" };
    },
    completeJob: async () => {
      calls.complete += 1;
      return { data: { success: true }, error: null };
    },
    failJob: async (_id, _worker, message) => {
      calls.fail.push(message);
      return { data: { success: true }, error: null };
    },
    now: () => NOW,
  };
  return { calls, dependencies: { ...base, ...overrides } };
}

const run = (dependencies) => processOneVideoCleanupJob("w", dependencies);

test("no_jobs never calls R2", async () => {
  const { calls, dependencies } = deps({
    claimJob: async () => ({ data: [], error: null }),
  });
  assert.deepEqual(await run(dependencies), { status: "no_jobs" });
  assert.equal(calls.delete.length, 0);
});

test("eligible job: delete, renew, complete", async () => {
  const { calls, dependencies } = deps();
  assert.deepEqual(await run(dependencies), { status: "completed" });
  assert.deepEqual(calls.delete, [[STUDENT, KEY]]);
  assert.equal(calls.complete, 1);
  assert.equal(calls.renew, 2);
});

test("duplicate invocation deletes only once", async () => {
  let claimed = false;
  const shared = {
    claimJob: async () => {
      if (claimed) return { data: [], error: null };
      claimed = true;
      return { data: [claimRow()], error: null };
    },
  };
  const first = deps(shared);
  const second = deps(shared);
  const [a, b] = await Promise.all([run(first.dependencies), run(second.dependencies)]);
  assert.deepEqual([a.status, b.status].sort(), ["completed", "no_jobs"]);
  assert.equal(first.calls.delete.length + second.calls.delete.length, 1);
});

test("already-absent object (R2 reports success) completes the job", async () => {
  const { calls, dependencies } = deps({
    deleteObject: async () => ({ status: "deleted" }),
  });
  assert.equal((await run(dependencies)).status, "completed");
  assert.equal(calls.complete, 1);
});

test("R2 success but DB complete fails: uncertain, not failed", async () => {
  for (const completeJob of [
    async () => ({ data: null, error: { message: "db down" } }),
    async () => {
      throw new Error("network");
    },
  ]) {
    const { calls, dependencies } = deps({ completeJob });
    assert.equal((await run(dependencies)).status, "completion_uncertain");
    assert.equal(calls.delete.length, 1);
    assert.equal(calls.fail.length, 0);
  }
});

test("retry after R2-success-but-DB-failure converges", async () => {
  let attempts = 0;
  const { calls, dependencies } = deps({
    completeJob: async () => {
      attempts += 1;
      return attempts === 1
        ? { data: null, error: { message: "db down" } }
        : { data: { success: true }, error: null };
    },
  });
  assert.equal((await run(dependencies)).status, "completion_uncertain");
  assert.equal((await run(dependencies)).status, "completed");
  assert.equal(calls.delete.length, 2);
});

test("R2 failure records a sanitized error and does not complete", async () => {
  const { calls, dependencies } = deps({
    deleteObject: async () => ({ status: "unavailable" }),
  });
  assert.equal((await run(dependencies)).status, "failed");
  assert.equal(calls.complete, 0);
  assert.deepEqual(calls.fail, ["Video object deletion failed."]);
});

test("thrown R2 error text never reaches the recorded error", async () => {
  const { calls, dependencies } = deps({
    deleteObject: async () => {
      throw new Error("sensitive-endpoint-detail");
    },
  });
  await run(dependencies);
  assert.deepEqual(calls.fail, ["Video object deletion failed."]);
});

test("lease lost before delete: R2 is never called", async () => {
  const { calls, dependencies } = deps({
    renewLease: async () => ({ data: false, error: null }),
  });
  assert.equal((await run(dependencies)).status, "lease_lost");
  assert.equal(calls.delete.length, 0);
});

test("lease lost after delete: DB is not marked complete", async () => {
  let n = 0;
  const { calls, dependencies } = deps({
    renewLease: async () => ({ data: ++n === 1, error: null }),
  });
  assert.equal((await run(dependencies)).status, "lease_lost");
  assert.equal(calls.delete.length, 1);
  assert.equal(calls.complete, 0);
});

test("lease check errors stop before deletion", async () => {
  const { calls, dependencies } = deps({
    renewLease: async () => ({ data: null, error: { message: "x" } }),
  });
  assert.equal((await run(dependencies)).status, "lease_check_failed");
  assert.equal(calls.delete.length, 0);
});

test("ineligible videos are never deleted", async () => {
  const cases = {
    notDue: { video_delete_after: "2027-01-01T00:00:00Z" },
    noDeadline: { video_delete_after: null },
    badDeadline: { video_delete_after: "not-a-date" },
    alreadyDeleted: { video_deleted_at: "2026-11-02T00:00:00Z" },
    wrongStatus: { submission_status: "evaluating" },
    keyMismatch: {
      video_object_key: `students/${STUDENT}/videos/${OTHER_VIDEO}.webm`,
    },
  };
  for (const [name, patch] of Object.entries(cases)) {
    const { calls, dependencies } = deps({
      getJobContext: async () => ({ data: [{ ...BASE_CONTEXT, ...patch }], error: null }),
    });
    assert.equal((await run(dependencies)).status, "failed", name);
    assert.equal(calls.delete.length, 0, name);
    assert.deepEqual(calls.fail, ["Video is not eligible for cleanup."], name);
  }
});

test("graded status is eligible", async () => {
  const { dependencies } = deps({
    getJobContext: async () => ({
      data: [{ ...BASE_CONTEXT, submission_status: "graded" }],
      error: null,
    }),
  });
  assert.equal((await run(dependencies)).status, "completed");
});

test("invalid key from the delete helper fails safely", async () => {
  const { calls, dependencies } = deps({
    deleteObject: async () => ({ status: "invalid_key" }),
  });
  assert.equal((await run(dependencies)).status, "failed");
  assert.deepEqual(calls.fail, ["Video object key was invalid."]);
  assert.equal(calls.complete, 0);
});

test("RPC errors are handled without deletion", async () => {
  const err = { message: "boom" };
  let r = deps({ recoverStaleJobs: async () => ({ data: null, error: err }) });
  assert.equal((await run(r.dependencies)).status, "recovery_failed");
  r = deps({ claimJob: async () => ({ data: null, error: err }) });
  assert.equal((await run(r.dependencies)).status, "claim_failed");
  r = deps({
    claimJob: async () => {
      throw new Error("x");
    },
  });
  assert.equal((await run(r.dependencies)).status, "claim_failed");
  r = deps({ getJobContext: async () => ({ data: null, error: err }) });
  assert.equal((await run(r.dependencies)).status, "failed");
  assert.equal(r.calls.delete.length, 0);
});

test("malformed claims are rejected", async () => {
  let r = deps({ claimJob: async () => ({ data: [{}, {}], error: null }) });
  assert.equal((await run(r.dependencies)).status, "invalid_claim");
  r = deps({ claimJob: async () => ({ data: [{ object_key: KEY }], error: null }) });
  assert.equal((await run(r.dependencies)).status, "invalid_claim");
  r = deps({
    claimJob: async () => ({ data: [{ job_id: "j", object_key: "" }], error: null }),
  });
  assert.equal((await run(r.dependencies)).status, "failed");
  assert.equal(r.calls.delete.length, 0);
});

test("unrecordable failure is reported", async () => {
  const { dependencies } = deps({
    deleteObject: async () => ({ status: "unavailable" }),
    failJob: async () => ({ data: null, error: { message: "db" } }),
  });
  assert.equal((await run(dependencies)).status, "failure_recording_failed");
});
