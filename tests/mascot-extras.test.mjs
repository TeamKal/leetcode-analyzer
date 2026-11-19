import assert from "node:assert/strict";
import test from "node:test";
import { checkMascotMode } from "../src/lib/flags/flagCheck.ts";
import { EXTRA_DURATION, poseFor } from "../src/components/login/mascot/extras/poses.ts";

// --- The server-side switch ----------------------------------------------------

/** A fake client. `byColumns` answers per select() column list, like the real table. */
const fakeClient = (byColumns) => ({
  from: () => ({
    select: (columns) => ({
      eq: () => ({ eq: () => ({ limit: async () => byColumns[columns] ?? { data: null, error: { message: "no" } } }) }),
    }),
  }),
});
const FULL = "flag,heart";
const row = (extra = {}) => ({ data: [{ flag: "ui_extras", heart: true, ...extra }], error: null });

test("a row means extras; the heart column decides if it plays by itself", async () => {
  assert.equal(await checkMascotMode(fakeClient({ [FULL]: row() }), "u1", "ui_extras"), "auto");
  assert.equal(await checkMascotMode(fakeClient({ [FULL]: row({ heart: false }) }), "u1", "ui_extras"), "manual");
  assert.equal(await checkMascotMode(fakeClient({ [FULL]: { data: [], error: null } }), "u1", "ui_extras"), "off");
  assert.equal(await checkMascotMode(fakeClient({ [FULL]: row({ flag: "other" }) }), "u1", "ui_extras"), "off");
});

test("before the heart column exists, a plain row still plays by itself", async () => {
  const old = { [FULL]: { data: null, error: { message: "column does not exist" } }, flag: { data: [{ flag: "ui_extras" }], error: null } };
  assert.equal(await checkMascotMode(fakeClient(old), "u1", "ui_extras"), "auto");
  const none = { ...old, flag: { data: [], error: null } };
  assert.equal(await checkMascotMode(fakeClient(none), "u1", "ui_extras"), "off");
});

test("it fails closed: no id, errors, odd data or a throw all mean off", async () => {
  const on = fakeClient({ [FULL]: row() });
  assert.equal(await checkMascotMode(on, null, "ui_extras"), "off");
  assert.equal(await checkMascotMode(on, "", "ui_extras"), "off");
  assert.equal(await checkMascotMode(on, "u1", ""), "off");
  assert.equal(await checkMascotMode(fakeClient({}), "u1", "ui_extras"), "off"); // both reads error
  assert.equal(await checkMascotMode(fakeClient({ [FULL]: { data: "yes", error: null } }), "u1", "ui_extras"), "off");
  assert.equal(await checkMascotMode(fakeClient({ [FULL]: { data: null, error: null } }), "u1", "ui_extras"), "off");
  const throwing = { from: () => { throw new Error("boom"); } };
  assert.equal(await checkMascotMode(throwing, "u1", "ui_extras"), "off");
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
  const heart = poseFor("heart", 700);
  assert.ok(Math.abs(heart.wave) > 5 && heart.ear > 10);
});
