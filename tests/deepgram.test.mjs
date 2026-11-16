import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeepgramUrl,
  transcribeWithDeepgram,
} from "../src/lib/transcription/deepgram.ts";
import { runServerTranscription } from "../src/lib/transcription/serverFlow.ts";

const STUDENT = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const KEY = `students/${STUDENT}/videos/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d.webm`;
const SECRET = "dg-test-secret-value";

function okResponse(transcript, duration = 12.5) {
  return new Response(
    JSON.stringify({
      metadata: { duration },
      results: { channels: [{ alternatives: [{ transcript }] }] },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ---------- Deepgram client ----------

test("request URL uses nova-3, English, opt-out and encoded keyterms", () => {
  const url = new URL(buildDeepgramUrl());
  assert.equal(url.origin + url.pathname, "https://api.deepgram.com/v1/listen");
  assert.equal(url.searchParams.get("model"), "nova-3");
  assert.equal(url.searchParams.get("language"), "en");
  assert.equal(url.searchParams.get("smart_format"), "true");
  assert.equal(url.searchParams.get("mip_opt_out"), "true");
  const terms = url.searchParams.getAll("keyterm");
  assert.ok(terms.includes("hash map"));
  assert.ok(terms.length >= 20 && terms.length <= 60);
  assert.ok(buildDeepgramUrl().includes("keyterm=hash%20map"), "spaces encoded as %20");
  assert.ok(!buildDeepgramUrl().includes(SECRET));
});

test("success sends the key only in the header and the link in the body", async () => {
  let seen;
  const result = await transcribeWithDeepgram({
    audioUrl: "https://r2.example/video.webm?sig=abc",
    apiKey: SECRET,
    fetchImpl: async (url, init) => {
      seen = { url: String(url), init };
      return okResponse("  We use a hash map.  ");
    },
  });
  assert.deepEqual(result, { ok: true, transcript: "We use a hash map.", durationSeconds: 12.5 });
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers.Authorization, `Token ${SECRET}`);
  assert.deepEqual(JSON.parse(seen.init.body), { url: "https://r2.example/video.webm?sig=abc" });
  assert.ok(!seen.url.includes(SECRET), "key never in the URL");
});

test("missing api key fails closed without calling the provider", async () => {
  let called = false;
  const result = await transcribeWithDeepgram({
    audioUrl: "https://x",
    apiKey: undefined,
    fetchImpl: async () => {
      called = true;
      return okResponse("x");
    },
  });
  assert.deepEqual(result, { ok: false, reason: "misconfigured" });
  assert.equal(called, false);
});

test("HTTP errors map to sanitized reasons and never leak the body", async () => {
  const cases = [
    [401, "misconfigured"],
    [403, "misconfigured"],
    [400, "rejected"],
    [422, "rejected"],
    [402, "unavailable"],
    [429, "unavailable"],
    [500, "unavailable"],
    [503, "unavailable"],
  ];
  for (const [status, reason] of cases) {
    const result = await transcribeWithDeepgram({
      audioUrl: "https://x",
      apiKey: SECRET,
      fetchImpl: async () => new Response(`secret-provider-detail ${SECRET}`, { status }),
    });
    assert.deepEqual(result, { ok: false, reason }, String(status));
    assert.ok(!JSON.stringify(result).includes("secret-provider-detail"));
  }
});

test("empty, missing and malformed transcripts are handled", async () => {
  for (const body of [okResponse(""), okResponse("   "), new Response("{}", { status: 200 })]) {
    const result = await transcribeWithDeepgram({
      audioUrl: "https://x",
      apiKey: SECRET,
      fetchImpl: async () => body,
    });
    assert.deepEqual(result, { ok: false, reason: "empty" });
  }
  const malformed = await transcribeWithDeepgram({
    audioUrl: "https://x",
    apiKey: SECRET,
    fetchImpl: async () => new Response("not json", { status: 200 }),
  });
  assert.deepEqual(malformed, { ok: false, reason: "unavailable" });
});

test("network errors do not leak and slow responses time out", async () => {
  const networkFailure = await transcribeWithDeepgram({
    audioUrl: "https://x",
    apiKey: SECRET,
    fetchImpl: async () => {
      throw new Error(`connect ECONNREFUSED ${SECRET}`);
    },
  });
  assert.deepEqual(networkFailure, { ok: false, reason: "unavailable" });

  const timedOut = await transcribeWithDeepgram({
    audioUrl: "https://x",
    apiKey: SECRET,
    timeoutMs: 30,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  });
  assert.deepEqual(timedOut, { ok: false, reason: "timeout" });
});

// ---------- server flow ----------

function flowDeps(overrides = {}) {
  const calls = { verify: [], reserve: [], presign: [], transcribe: [] };
  const dependencies = {
    getAccess: async () => ({ status: "allowed", studentId: STUDENT }),
    verifyVideo: async (studentId, key) => {
      calls.verify.push([studentId, key]);
      return { verified: true };
    },
    reserveSlot: async (studentId, key) => {
      calls.reserve.push([studentId, key]);
      return true;
    },
    presignRead: async (studentId, key) => {
      calls.presign.push([studentId, key]);
      return "https://r2.example/signed";
    },
    transcribe: async (url) => {
      calls.transcribe.push(url);
      return { ok: true, transcript: "Hello world." };
    },
    ...overrides,
  };
  return { calls, dependencies };
}

test("flow: happy path returns the transcript using the session student", async () => {
  const { calls, dependencies } = flowDeps();
  const result = await runServerTranscription({ videoObjectKey: KEY }, dependencies);
  assert.deepEqual(result, { status: 200, body: { transcript: "Hello world." } });
  assert.deepEqual(calls.verify, [[STUDENT, KEY]]);
  assert.deepEqual(calls.reserve, [[STUDENT, KEY]]);
  assert.deepEqual(calls.presign, [[STUDENT, KEY]]);
});

test("flow: a browser-supplied student id is ignored", async () => {
  const { calls, dependencies } = flowDeps();
  await runServerTranscription(
    { videoObjectKey: KEY, studentId: "11111111-1111-4111-8111-111111111111", role: "admin" },
    dependencies,
  );
  assert.equal(calls.verify[0][0], STUDENT);
});

test("flow: unauthenticated, forbidden and unenrolled users never reach R2 or the provider", async () => {
  const cases = [
    [{ status: "unauthenticated" }, 401],
    [{ status: "forbidden" }, 403],
    [{ status: "not-enrolled" }, 403],
    [{ status: "error" }, 403],
  ];
  for (const [access, status] of cases) {
    const { calls, dependencies } = flowDeps({ getAccess: async () => access });
    const result = await runServerTranscription({ videoObjectKey: KEY }, dependencies);
    assert.equal(result.status, status);
    assert.equal(calls.verify.length + calls.reserve.length + calls.transcribe.length, 0);
  }
  const { dependencies } = flowDeps({
    getAccess: async () => {
      throw new Error("boom");
    },
  });
  assert.equal((await runServerTranscription({ videoObjectKey: KEY }, dependencies)).status, 403);
});

test("flow: bad bodies are rejected before any work", async () => {
  for (const body of [null, undefined, "x", 5, {}, { videoObjectKey: 5 }, { videoObjectKey: "" }]) {
    const { calls, dependencies } = flowDeps();
    const result = await runServerTranscription(body, dependencies);
    assert.equal(result.status, 400);
    assert.equal(calls.verify.length, 0);
  }
});

test("flow: another student's or malformed key is forbidden and spends nothing", async () => {
  for (const reason of ["not_owned", "invalid_object_key"]) {
    const { calls, dependencies } = flowDeps({
      verifyVideo: async () => ({ verified: false, reason }),
    });
    const result = await runServerTranscription({ videoObjectKey: "../x" }, dependencies);
    assert.equal(result.status, 403);
    assert.equal(calls.reserve.length + calls.presign.length + calls.transcribe.length, 0);
  }
});

test("flow: missing, invalid and unverifiable videos map to clear statuses", async () => {
  const cases = [
    ["object_not_found", 404],
    ["invalid_video", 400],
    ["verification_unavailable", 503],
  ];
  for (const [reason, status] of cases) {
    const { calls, dependencies } = flowDeps({
      verifyVideo: async () => ({ verified: false, reason }),
    });
    assert.equal((await runServerTranscription({ videoObjectKey: KEY }, dependencies)).status, status);
    assert.equal(calls.transcribe.length, 0);
  }
});

test("flow: daily limit blocks the provider call", async () => {
  const { calls, dependencies } = flowDeps({ reserveSlot: async () => false });
  const result = await runServerTranscription({ videoObjectKey: KEY }, dependencies);
  assert.equal(result.status, 429);
  assert.equal(calls.presign.length + calls.transcribe.length, 0);
});

test("flow: limiter failure fails closed", async () => {
  const { calls, dependencies } = flowDeps({
    reserveSlot: async () => {
      throw new Error("rpc missing");
    },
  });
  const result = await runServerTranscription({ videoObjectKey: KEY }, dependencies);
  assert.equal(result.status, 503);
  assert.equal(calls.transcribe.length, 0);
});

test("flow: provider failures are sanitized", async () => {
  const cases = [
    [{ ok: false, reason: "unavailable" }, 503],
    [{ ok: false, reason: "timeout" }, 503],
    [{ ok: false, reason: "misconfigured" }, 503],
    [{ ok: false, reason: "rejected" }, 502],
    [{ ok: false, reason: "empty" }, 422],
  ];
  for (const [outcome, status] of cases) {
    const { dependencies } = flowDeps({ transcribe: async () => outcome });
    const result = await runServerTranscription({ videoObjectKey: KEY }, dependencies);
    assert.equal(result.status, status);
    assert.ok(!JSON.stringify(result.body).toLowerCase().includes("deepgram"));
  }
  const { dependencies } = flowDeps({
    presignRead: async () => {
      throw new Error("r2 secret detail");
    },
  });
  const presignFailure = await runServerTranscription({ videoObjectKey: KEY }, dependencies);
  assert.equal(presignFailure.status, 503);
  assert.ok(!JSON.stringify(presignFailure.body).includes("secret"));
  const thrown = flowDeps({
    transcribe: async () => {
      throw new Error("provider detail");
    },
  });
  assert.equal((await runServerTranscription({ videoObjectKey: KEY }, thrown.dependencies)).status, 503);
});
