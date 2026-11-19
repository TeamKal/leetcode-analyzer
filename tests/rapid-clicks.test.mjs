import assert from "node:assert/strict";
import test from "node:test";
import { createRapidClickCounter } from "../src/lib/ui/rapidClicks.ts";

const run = (times, options = { count: 6, gapMs: 1200 }) => {
  const counter = createRapidClickCounter(options);
  return times.map((t) => counter.hit(t));
};

test("six quick clicks in a row trigger on the sixth", () => {
  assert.deepEqual(run([0, 200, 400, 600, 800, 1000]), [false, false, false, false, false, true]);
});

test("a pause longer than the gap starts the count again", () => {
  // Five quick clicks, a pause, then five more: never six in a row.
  assert.deepEqual(
    run([0, 200, 400, 600, 800, 2500, 2700, 2900, 3100, 3300]),
    Array(10).fill(false),
  );
});

test("the gap is measured between neighbouring clicks, not from the first", () => {
  // Each click is 1000 ms after the last (within 1200), so six slow-ish clicks count.
  assert.deepEqual(run([0, 1000, 2000, 3000, 4000, 5000]), [false, false, false, false, false, true]);
  // One gap of 1300 breaks it.
  assert.deepEqual(run([0, 1000, 2300, 3300, 4300, 5300]), Array(6).fill(false));
});

test("after it triggers it starts over from zero", () => {
  const counter = createRapidClickCounter({ count: 6, gapMs: 1200 });
  const results = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100].map((t) => counter.hit(t));
  assert.deepEqual(
    results,
    [false, false, false, false, false, true, false, false, false, false, false, true],
  );
});

test("reset forgets the clicks so far", () => {
  const counter = createRapidClickCounter({ count: 3, gapMs: 500 });
  counter.hit(0);
  counter.hit(100);
  counter.reset();
  assert.equal(counter.streak, 0);
  assert.deepEqual([counter.hit(200), counter.hit(300), counter.hit(400)], [false, false, true]);
});
