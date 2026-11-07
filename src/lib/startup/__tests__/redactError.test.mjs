// The crash screen may show technical detail, but never personal data and
// never an unbounded trace.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { redactError, redactStack } from "../redactError.js";

describe("redactError", () => {
  test("keeps the error class and message", () => {
    const summary = redactError(new TypeError("Cannot read properties of undefined"));
    assert.match(summary, /^TypeError: /);
    assert.match(summary, /Cannot read properties of undefined/);
  });

  test("removes email addresses", () => {
    const summary = redactError(new Error("No row for owner@example.com"));
    assert.equal(summary.includes("owner@example.com"), false);
    assert.match(summary, /\[email\]/);
  });

  test("removes bearer tokens and JWTs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
    const summary = redactError(new Error(`Request failed with Bearer ${jwt}`));
    assert.equal(summary.includes(jwt), false);
    assert.match(summary, /\[token\]/);
  });

  test("removes long opaque identifiers", () => {
    const id = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
    const summary = redactError(new Error(`account ${id} not found`));
    assert.equal(summary.includes(id), false);
    assert.match(summary, /\[redacted\]/);
  });

  test("is bounded even for an enormous message", () => {
    const summary = redactError(new Error("x".repeat(5000)));
    assert.ok(summary.length <= 400, `expected <= 400, got ${summary.length}`);
  });

  test("is safe for missing, string and unexpected values", () => {
    assert.equal(redactError(null), "Error: No further detail available.");
    assert.equal(redactError(undefined), "Error: No further detail available.");
    assert.match(redactError("plain string failure"), /^Error: plain string failure$/);
  });
});

describe("redactStack", () => {
  test("scrubs personal data out of a stack", () => {
    const stack = "Error: boom\n    at foo (owner@example.com)\n    at bar (bearer abc123def456)";
    const clean = redactStack(stack);
    assert.equal(clean.includes("owner@example.com"), false);
    assert.match(clean, /\[email\]/);
  });

  test("is bounded so it cannot overflow the screen", () => {
    const stack = "at frame\n".repeat(2000);
    assert.ok(redactStack(stack).length <= 1200);
  });

  test("returns nothing for absent or non-string stacks", () => {
    assert.equal(redactStack(undefined), "");
    assert.equal(redactStack(null), "");
    assert.equal(redactStack(42), "");
  });
});