import assert from "node:assert/strict";
import test from "node:test";
import { bestScroll, planRoute, sampleRoute } from "../src/lib/ui/blastRoute.ts";
import { buildShards, triangulate } from "../src/lib/ui/shards.ts";

const input = {
  sections: [
    { box: { left: 300, top: 10, width: 600, height: 50 }, fixed: true },
    { box: { left: 300, top: 120, width: 600, height: 60 }, fixed: false },
    { box: { left: 300, top: 260, width: 600, height: 280 }, fixed: false },
    { box: { left: 300, top: 600, width: 600, height: 420 }, fixed: false },
    { box: { left: 300, top: 1060, width: 600, height: 380 }, fixed: false },
  ],
  vw: 1200,
  vh: 800,
  maxScroll: 900,
  startScroll: 0,
  rest: { x: 1100, y: 740 },
  size: 112,
  beginMs: 300,
  returnStartMs: 5700,
  centredMs: 7000,
  centreScale: 1.6,
};

test("every stop happens in order inside the planting window", () => {
  const plan = planRoute(input);
  assert.equal(plan.stops.length, 5);
  let last = 0;
  for (const s of plan.stops) {
    assert.ok(s.travelStart >= last && s.arriveMs > s.travelStart);
    assert.ok(s.dropMs > s.arriveMs && s.departMs > s.dropMs);
    last = s.departMs;
  }
  assert.ok(last <= 5700 + 1e-6);
});

test("the mascot is at the centre at exactly 7 s and stays there", () => {
  const plan = planRoute(input);
  for (const t of [7000, 7001, 9000, 19000, 30000]) {
    const s = sampleRoute(plan, t);
    assert.equal(s.x, 600);
    assert.equal(s.y, 400);
    assert.equal(s.s, 1.6);
    assert.equal(s.scrollY, plan.finalScroll);
  }
});

test("it starts at rest and stands at each stop while planting", () => {
  const plan = planRoute(input);
  const first = sampleRoute(plan, 0);
  assert.equal(first.x, 1100);
  assert.equal(first.y, 740);
  for (const st of plan.stops) {
    const s = sampleRoute(plan, st.dropMs);
    assert.equal(s.x, st.stand.x);
    assert.equal(s.y, st.stand.y);
    assert.equal(s.stop, st.index);
  }
});

test("the final scroll shows as many charges as it can", () => {
  assert.equal(bestScroll([100, 500, 900], 800, 900, 0) <= 100, true);
  const s = bestScroll([100, 150, 900, 950], 800, 1000, 0);
  assert.ok([100, 150].every((y) => y >= s + 70 && y <= s + 730) || [900, 950].every((y) => y >= s + 70 && y <= s + 730));
});

test("the triangulation covers the whole screen", () => {
  const w = 900;
  const h = 600;
  const shards = buildShards({ width: w, height: h, impacts: [{ x: 300, y: 300 }, { x: 700, y: 200 }] });
  assert.ok(shards.length > 150);
  const area = shards.reduce((sum, { tri }) => {
    const [a, b, c] = tri;
    return sum + Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  }, 0);
  assert.ok(Math.abs(area - w * h) / (w * h) < 0.001, `area ${area}`);
  assert.deepEqual(triangulate([{ x: 0, y: 0 }]), []);
});
