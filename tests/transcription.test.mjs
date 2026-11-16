import assert from "node:assert/strict";
import test from "node:test";
import { segmentSpeech } from "../src/lib/audioSegments.ts";
import {
  collapseRepeats,
  isDegenerateTranscript,
} from "../src/lib/transcriptText.ts";

const SR = 16_000;

// Builds audio from [seconds, amplitude] parts; amplitude 0 is digital silence.
function build(parts, noise = 0) {
  const total = parts.reduce((sum, [seconds]) => sum + seconds, 0);
  const audio = new Float32Array(Math.round(total * SR));
  let cursor = 0;
  for (const [seconds, amplitude] of parts) {
    const length = Math.round(seconds * SR);
    for (let index = 0; index < length; index += 1) {
      const tone = amplitude * Math.sin((2 * Math.PI * 220 * (cursor + index)) / SR);
      const hiss = noise * (Math.random() * 2 - 1);
      audio[cursor + index] = tone + hiss;
    }
    cursor += length;
  }
  return audio;
}

test("pure silence yields no segments", () => {
  const result = segmentSpeech(build([[10, 0]]));
  assert.equal(result.segments.length, 0);
  assert.equal(result.speechSeconds, 0);
});

test("empty and tiny inputs are safe", () => {
  assert.equal(segmentSpeech(new Float32Array(0)).segments.length, 0);
  assert.equal(segmentSpeech(new Float32Array(100)).segments.length, 0);
});

test("long silences between speech are removed", () => {
  const audio = build([[3, 0], [2, 0.3], [6, 0], [2, 0.3], [3, 0]]);
  const result = segmentSpeech(audio);
  assert.equal(result.segments.length, 1);
  const [segment] = result.segments;
  assert.ok(segment.samples.length / SR < 6.5, "silence was trimmed");
  assert.ok(segment.samples.length / SR > 4, "speech was kept");
  assert.ok(segment.startSeconds >= 2.5 && segment.startSeconds <= 3);
  assert.ok(segment.endSeconds >= 13 && segment.endSeconds <= 13.5);
});

test("short pauses inside speech are preserved as one region", () => {
  const audio = build([[2, 0.3], [0.3, 0], [2, 0.3]]);
  const result = segmentSpeech(audio);
  assert.equal(result.segments.length, 1);
  assert.ok(result.segments[0].samples.length / SR >= 4.2);
});

test("a short click is dropped", () => {
  const audio = build([[2, 0], [0.1, 0.5], [2, 0]]);
  assert.equal(segmentSpeech(audio).segments.length, 0);
});

test("quiet speech is still detected", () => {
  const audio = build([[2, 0], [3, 0.02], [2, 0]]);
  const result = segmentSpeech(audio);
  assert.equal(result.segments.length, 1);
});

test("steady background noise is not treated as speech", () => {
  const audio = build([[3, 0], [2, 0.3], [4, 0], [2, 0.3], [3, 0]], 0.004);
  const result = segmentSpeech(audio);
  assert.equal(result.segments.length, 1);
  assert.ok(result.segments[0].samples.length / SR < 7);
});

test("no segment exceeds the 28 second window and none is lost", () => {
  const audio = build([[75, 0.3]]);
  const result = segmentSpeech(audio);
  assert.ok(result.segments.length >= 3);
  let covered = 0;
  for (const segment of result.segments) {
    assert.ok(segment.samples.length / SR <= 28.4, "segment fits the window");
    covered += segment.speechSeconds;
  }
  assert.ok(covered >= 74, `speech covered (${covered})`);
});

test("segments are ordered and non-overlapping in the original timeline", () => {
  const audio = build([[20, 0.3], [2, 0], [20, 0.3], [2, 0], [20, 0.3]]);
  const { segments } = segmentSpeech(audio);
  assert.ok(segments.length >= 2);
  for (let index = 1; index < segments.length; index += 1) {
    assert.ok(segments[index].startSeconds >= segments[index - 1].endSeconds - 0.05);
  }
});

test("collapseRepeats removes decoder loops but keeps normal text", () => {
  assert.equal(collapseRepeats("the the the the the"), "the");
  assert.equal(
    collapseRepeats("so we use a hash map hash map hash map hash map to look up"),
    "so we use a hash map to look up",
  );
  assert.equal(
    collapseRepeats("Thank you. Thank you. Thank you. Thank you. Thank you."),
    "Thank you.",
  );
  const normal = "We iterate over the array and the array is sorted twice or thrice";
  assert.equal(collapseRepeats(normal), normal);
  assert.equal(collapseRepeats("very very good"), "very very good");
  assert.equal(collapseRepeats(""), "");
});

test("degenerate detection flags loops and absurd word density only", () => {
  assert.equal(isDegenerateTranscript("a b a b a b a b a b", 10), true);
  assert.equal(isDegenerateTranscript(Array(60).fill("word").join(" ") + " x", 5), true);
  assert.equal(
    isDegenerateTranscript("We use a hash map to store the complement of each number.", 5),
    false,
  );
  assert.equal(isDegenerateTranscript("", 5), false);
  assert.equal(isDegenerateTranscript("Thank you.", 0.5), false);
});
