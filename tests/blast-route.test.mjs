import assert from "node:assert/strict";
import test from "node:test";
import { createClickTally } from "../src/lib/ui/clickTally.ts";
import { chargePoint, scrollTargetFor, standPoint } from "../src/lib/ui/blastRoute.ts";
import { createCueTrack, runSteps } from "../src/lib/ui/timeline.ts";

test("the tally fires on exactly the tenth click, once", () => {
  const tally = createClickTally(10);
  const results = Array.from({ length: 14 }, () => tally.hit());
  assert.deepEqual(
    results.map((r, i) => (r ? i + 1 : 0)).filter(Boolean),
    [10],
  );
});

test("the charge sits on the bottom edge, inside the viewport", () => {
  const p = chargePoint({ left: 100, top: 200, width: 400, height: 150 }, 1000);
  assert.equal(p.y, 340);
  assert.equal(p.x, 100 + 400 * 0.82);
  assert.equal(chargePoint({ left: 900, top: 0, width: 400, height: 50 }, 1000).x, 982);
});

test("the mascot stands beside the charge and stays on screen", () => {
  const s = standPoint({ x: 300, y: 400 }, 1000, 800, 100);
  assert.ok(s.x < 300 && s.y < 400);
  const edge = standPoint({ x: 20, y: 400 }, 1000, 800, 100);
  assert.ok(edge.x >= 58);
});

test("scrolling is skipped when the edge is already comfortably visible", () => {
  const box = { left: 0, top: 300, width: 100, height: 100 };
  assert.equal(scrollTargetFor(box, 50, 800, 2000), 50);
  const low = { left: 0, top: 900, width: 100, height: 100 };
  assert.equal(scrollTargetFor(low, 0, 800, 2000), 1000 - 480);
  assert.equal(scrollTargetFor(low, 0, 800, 100), 100);
});

test("steps run in order and stop when aborted", async () => {
  const seen = [];
  const ac = new AbortController();
  await runSteps(
    [
      { name: "a", run: async () => void seen.push("a") },
      {
        name: "b",
        run: async () => {
          seen.push("b");
          ac.abort();
        },
      },
      { name: "c", run: async () => void seen.push("c") },
    ],
    ac.signal,
  );
  assert.deepEqual(seen, ["a", "b"]);
});

test("cues fire once each when the clock passes them", () => {
  const fired = [];
  const track = createCueTrack([
    { at: 2000, name: "late", run: () => fired.push("late") },
    { at: 500, name: "early", run: () => fired.push("early") },
  ]);
  track.update(100);
  track.update(600);
  track.update(300);
  track.update(2500);
  track.update(2600);
  assert.deepEqual(fired, ["early", "late"]);
  assert.equal(track.remaining, 0);
});
