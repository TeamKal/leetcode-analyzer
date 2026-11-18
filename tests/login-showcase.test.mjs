import assert from "node:assert/strict";
import test from "node:test";
import {
  centredBaseline,
  fitFontSize,
  letterDelay,
  STROKE,
  strokeTotalMs,
  strokeWidthFor,
  TITLE_TRIM_PX,
  titleTotalMs,
  toGlyphs,
} from "../src/components/login/stroke.ts";
import {
  AI_TOTAL,
  formatClock,
  mixLabel,
  RUBRIC,
  STAGES,
  stageIndex,
} from "../src/components/login/demo/stages.ts";
import { EVALUATION_RUBRIC } from "../src/lib/evaluation/validator.ts";

test("letters draw in left to right, one after another", () => {
  assert.equal(letterDelay(0), 0);
  assert.equal(letterDelay(1), STROKE.staggerMs);
  assert.ok(letterDelay(5) > letterDelay(4));
  // The title is finished when the last letter has finished drawing.
  assert.equal(strokeTotalMs(15), letterDelay(14) + STROKE.drawMs);
  assert.equal(strokeTotalMs(1), STROKE.drawMs);
  assert.equal(strokeTotalMs(0), STROKE.drawMs);
});

test("the fill never gets ahead of the outline and finishes after it", () => {
  // The fill starts once the first letter's outline is complete.
  assert.ok(STROKE.fillDelayMs >= STROKE.drawMs);
  // It reaches the last letter after that letter's outline is drawn.
  assert.ok(STROKE.fillDelayMs + STROKE.fillSweepMs >= strokeTotalMs(15));
  // The whole entrance ends when the fill does.
  assert.equal(titleTotalMs(15), STROKE.fillDelayMs + STROKE.fillSweepMs);
  assert.ok(titleTotalMs(15) >= strokeTotalMs(15));
});

test("fitFontSize is limited by whichever of height or width is tighter", () => {
  // Plenty of width: the height decides.
  assert.equal(fitFontSize(2000, 100, 7), 80);
  // Narrow box: the width decides (800 * 0.97 / 7 = 110.8 -> 110).
  assert.equal(fitFontSize(800, 500, 7), 110);
  // Never smaller than the minimum.
  assert.equal(fitFontSize(10, 10, 7), 24);
});

test("the title is set a few pixels smaller than the biggest that fits", () => {
  assert.ok(TITLE_TRIM_PX >= 5 && TITLE_TRIM_PX <= 10);
  const biggest = fitFontSize(2000, 100, 7);
  assert.equal(fitFontSize(2000, 100, 7, { trim: TITLE_TRIM_PX }), biggest - TITLE_TRIM_PX);
  // Still never below the minimum.
  assert.equal(fitFontSize(10, 10, 7, { trim: TITLE_TRIM_PX }), 24);
});

test("the baseline centres the ink vertically", () => {
  // Ink 74 above and 0 below the baseline, in a 100 tall box: baseline at 87.
  assert.equal(centredBaseline(100, 74, 0), 87);
  // Letters with descenders sit a little higher.
  assert.ok(centredBaseline(100, 74, 20) < centredBaseline(100, 74, 0));
});

test("the stroke width scales with the type and has a floor", () => {
  assert.equal(strokeWidthFor(10), 1);
  assert.ok(strokeWidthFor(120) > strokeWidthFor(60));
  // Thin: at the title's usual size it stays close to a single pixel.
  assert.ok(strokeWidthFor(106) <= 1.1);
});

test("glyphs keep their spaces as non-breaking spaces", () => {
  const glyphs = toGlyphs("Student Tracker");
  assert.equal(glyphs.length, 15);
  assert.equal(glyphs[7], " ");
  assert.equal(glyphs.join("").replace(/ /g, " "), "Student Tracker");
});

test("the demo stages are in workflow order with one or two word labels", () => {
  assert.deepEqual(
    STAGES.map((stage) => stage.id),
    ["submission", "recording", "transcription", "analysis", "feedback"],
  );
  for (const stage of STAGES) {
    assert.ok(stage.label.split(" ").length <= 2);
  }
  assert.equal(stageIndex("analysis"), 3);
});

test("the demo rubric matches the evaluator's real rubric", () => {
  const demo = Object.fromEntries(RUBRIC.map((row) => [row.key, row.max]));
  assert.deepEqual(demo, { ...EVALUATION_RUBRIC });
  for (const row of RUBRIC) assert.ok(row.score >= 0 && row.score <= row.max);
  assert.equal(AI_TOTAL, 8.5);
});

test("formatClock pads minutes and seconds", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(42), "00:42");
  assert.equal(formatClock(75.9), "01:15");
  assert.equal(formatClock(-3), "00:00");
});

test("mixLabel starts at the old word, ends at the new word, and scrambles between", () => {
  assert.equal(mixLabel("Submission", "Recording", 0), "Submission");
  assert.equal(mixLabel("Submission", "Recording", 1), "Recording");
  const middle = mixLabel("Submission", "Recording", 0.5);
  assert.ok(middle.length <= "Submission".length);
  assert.notEqual(middle, "Submission");
  assert.notEqual(middle, "Recording");
  // Deterministic: the same frame always looks the same.
  assert.equal(middle, mixLabel("Submission", "Recording", 0.5));
});
