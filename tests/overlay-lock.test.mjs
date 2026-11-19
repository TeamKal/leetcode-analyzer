import assert from "node:assert/strict";
import test from "node:test";
import { cornersAreTransparent, shouldBlockKey } from "../src/lib/ui/overlayLock.ts";

test("plain keys are blocked while the overlay is up", () => {
  for (const key of ["Tab", "Enter", " ", "Escape", "ArrowDown", "PageDown", "a", "Backspace"]) {
    assert.equal(shouldBlockKey({ key }), true, key);
  }
});

test("browser shortcuts and function keys are left alone", () => {
  assert.equal(shouldBlockKey({ key: "r", ctrlKey: true }), false);
  assert.equal(shouldBlockKey({ key: "w", metaKey: true }), false);
  assert.equal(shouldBlockKey({ key: "Tab", altKey: true }), false);
  for (const key of ["F5", "F11", "F12"]) assert.equal(shouldBlockKey({ key }), false, key);
  assert.equal(shouldBlockKey({ key: "F" }), true); // just the letter F
});

const frame = (w, h, alphaAt) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[(y * w + x) * 4 + 3] = alphaAt(x, y);
  return data;
};

test("a frame with transparent corners counts as transparent", () => {
  assert.equal(cornersAreTransparent(frame(8, 8, () => 0), 8, 8), true);
  // Something opaque in the middle does not matter, only the corners do.
  assert.equal(cornersAreTransparent(frame(8, 8, (x, y) => (x === 4 && y === 4 ? 255 : 0)), 8, 8), true);
});

test("an opaque corner (no transparency support) is not transparent", () => {
  assert.equal(cornersAreTransparent(frame(8, 8, () => 255), 8, 8), false);
  assert.equal(cornersAreTransparent(frame(8, 8, (x, y) => (x === 7 && y === 7 ? 255 : 0)), 8, 8), false);
});

test("bad input is never treated as transparent", () => {
  assert.equal(cornersAreTransparent(new Uint8ClampedArray(0), 8, 8), false);
  assert.equal(cornersAreTransparent(new Uint8ClampedArray(16), 1, 1), false);
  assert.equal(cornersAreTransparent(new Uint8ClampedArray(10), 8, 8), false);
});
