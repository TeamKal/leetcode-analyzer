import assert from "node:assert/strict";
import test from "node:test";
import { checkProfileFlag } from "../src/lib/flags/flagCheck.ts";
import { EXTRA_DURATION, poseFor } from "../src/components/login/mascot/extras/poses.ts";

// --- The server-side switch ----------------------------------------------------

const fakeClient = (result) => ({
  from: () => ({
    select: () => ({
      eq: () => ({ eq: () => ({ limit: async () => result }) }),
    }),
  }),
});

test("an account is on only when the table says so for that exact flag", async () => {
  assert.equal(await checkProfileFlag(fakeClient({ data: [{ flag: "ui_extras" }], error: null }), "u1", "ui_extras"), true);
  assert.equal(await checkProfileFlag(fakeClient({ data: [], error: null }), "u1", "ui_extras"), false);
  assert.equal(await checkProfileFlag(fakeClient({ data: [{ flag: "other" }], error: null }), "u1", "ui_extras"), false);
});

test("it fails closed: no id, an error, odd data or a throw all mean off", async () => {
  const on = fakeClient({ data: [{ flag: "ui_extras" }], error: null });
  assert.equal(await checkProfileFlag(on, null, "ui_extras"), false);
  assert.equal(await checkProfileFlag(on, "", "ui_extras"), false);
  assert.equal(await checkProfileFlag(on, "u1", ""), false);
  assert.equal(await checkProfileFlag(fakeClient({ data: [{ flag: "ui_extras" }], error: { message: "x" } }), "u1", "ui_extras"), false);
  assert.equal(await checkProfileFlag(fakeClient({ data: null, error: null }), "u1", "ui_extras"), false);
  assert.equal(await checkProfileFlag(fakeClient({ data: "yes", error: null }), "u1", "ui_extras"), false);
  const throwing = { from: () => { throw new Error("boom"); } };
  assert.equal(await checkProfileFlag(throwing, "u1", "ui_extras"), false);
});

// --- The expressions -----------------------------------------------------------

const NAMES = Object.keys(EXTRA_DURATION);

test("every expression eases in from nothing and back out to nothing", () => {
  for (const name of NAMES) {
    const d = EXTRA_DURATION[name];
    assert.equal(poseFor(name, 0).env, 0, `${name} starts at 0`);
    assert.equal(poseFor(name, d).env, 0, `${name} ends at 0`);
    assert.ok(poseFor(name, d / 2).env > 0.9, `${name} reaches full strength`);
  }
});

test("outside its duration an expression returns nothing", () => {
  for (const name of NAMES) {
    assert.equal(poseFor(name, -1), null);
    assert.equal(poseFor(name, EXTRA_DURATION[name] + 1), null);
    assert.equal(poseFor(name, Number.NaN), null);
  }
});

test("values stay in ranges the rig can draw", () => {
  for (const name of NAMES) {
    const d = EXTRA_DURATION[name];
    for (let t = 0; t <= d; t += 25) {
      const p = poseFor(name, t);
      assert.ok(p.env >= 0 && p.env <= 1);
      for (const [key, value] of Object.entries(p)) {
        assert.ok(Number.isFinite(value), `${name}.${key} is finite`);
      }
      if (p.gx !== undefined) assert.ok(Math.abs(p.gx) <= 1);
      if (p.gy !== undefined) assert.ok(Math.abs(p.gy) <= 1);
      if (p.wink !== undefined) assert.ok(p.wink >= 0 && p.wink <= 1);
    }
  }
});

test("the wink closes one eye, the shy look turns away, the heart traces with an arm", () => {
  const wink = poseFor("wink", 600);
  assert.ok(wink.wink > 0.9 && wink.smile === 1);
  const shy = poseFor("shy", 900);
  assert.ok(shy.gx < -0.5 && shy.cheek === 1);
  const heart = poseFor("heart", 350);
  assert.ok(Math.abs(heart.wave) > 5 && heart.ear > 10);
});
