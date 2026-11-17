import assert from "node:assert/strict";
import test from "node:test";
import { parseStudentInput, UUID_PATTERN } from "../src/lib/students/validate.ts";

test("parseStudentInput trims and lowercases", () => {
  assert.deepEqual(
    parseStudentInput({
      fullName: "  Asha Rao ",
      googleEmail: " Asha@Example.COM ",
      leetcodeUsername: " asha_r ",
    }),
    { fullName: "Asha Rao", googleEmail: "asha@example.com", leetcodeUsername: "asha_r" },
  );
});

test("parseStudentInput rejects bad input", () => {
  const ok = { fullName: "A", googleEmail: "a@b.co", leetcodeUsername: "a" };
  assert.notEqual(parseStudentInput(ok), null);
  assert.equal(parseStudentInput(null), null);
  assert.equal(parseStudentInput("x"), null);
  assert.equal(parseStudentInput({ ...ok, fullName: "  " }), null);
  assert.equal(parseStudentInput({ ...ok, googleEmail: "nope" }), null);
  assert.equal(parseStudentInput({ ...ok, leetcodeUsername: "two words" }), null);
  assert.equal(parseStudentInput({ ...ok, fullName: "x".repeat(151) }), null);
  assert.equal(parseStudentInput({ ...ok, leetcodeUsername: 5 }), null);
});

test("UUID_PATTERN accepts v4 and rejects junk", () => {
  assert.equal(UUID_PATTERN.test("1f9511be-187d-47f8-83aa-2fa62d0783fb"), true);
  assert.equal(UUID_PATTERN.test("not-a-uuid"), false);
});
