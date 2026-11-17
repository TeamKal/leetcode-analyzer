import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDuration,
  formatFileSize,
  getFileExtension,
} from "../src/lib/format.ts";

test("formatFileSize picks a readable unit", () => {
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(2048), "2 KB");
  assert.equal(formatFileSize(5 * 1024 * 1024), "5.0 MB");
});

test("formatDuration handles minutes, hours and missing values", () => {
  assert.equal(formatDuration(null), null);
  assert.equal(formatDuration(Number.NaN), null);
  assert.equal(formatDuration(48), "0:48");
  assert.equal(formatDuration(125), "2:05");
  assert.equal(formatDuration(3725), "1:02:05");
});

test("getFileExtension lowercases and tolerates no extension", () => {
  assert.equal(getFileExtension("Clip.MP4"), "mp4");
  assert.equal(getFileExtension("a.b.webm"), "webm");
});
