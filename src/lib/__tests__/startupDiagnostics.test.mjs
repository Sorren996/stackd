// Tests for the startup deadline and failure classification.
//
// Run with:
//   node --test --experimental-strip-types src/lib/__tests__/
//
// Nothing here touches the network, the database or any health record.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  STARTUP_CODES,
  STARTUP_DEADLINE_MS,
  STARTUP_DATA_DEADLINE_MS,
  startupErrorCode,
  withStartupDeadline,
} from "../startupDiagnostics.js";

describe("withStartupDeadline", () => {
  test("passes a result through when the step answers in time", async () => {
    const value = await withStartupDeadline(Promise.resolve({ ok: true }), 50);
    assert.deepEqual(value, { ok: true });
  });

  test("rejects with a TIMEOUT code when the step never answers", async () => {
    const hung = new Promise(() => {});
    await assert.rejects(
      () => withStartupDeadline(hung, 20),
      (error) => error.startupCode === "TIMEOUT"
    );
  });

  test("a slow step that answers after the deadline is not applied", async () => {
    let settled = false;
    const slow = new Promise((resolve) => setTimeout(() => resolve("late"), 80));
    try {
      await withStartupDeadline(slow, 15);
    } catch {
      settled = true;
    }
    assert.equal(settled, true);
  });

  test("the deadlines are finite technical bounds", () => {
    const deadlines = [STARTUP_DEADLINE_MS, STARTUP_DATA_DEADLINE_MS];
    for (const ms of deadlines) {
      assert.ok(Number.isFinite(ms) && ms > 0 && ms <= 30_000);
    }
  });
});

describe("startupErrorCode", () => {
  test("a deadline is a timeout", () => {
    assert.equal(startupErrorCode({ startupCode: "TIMEOUT" }), STARTUP_CODES.TIMEOUT);
  });

  test("a 401 or 403 is a definite session answer", () => {
    assert.equal(startupErrorCode({ status: 401 }), STARTUP_CODES.UNAUTHORIZED);
    assert.equal(startupErrorCode({ response: { status: 403 } }), STARTUP_CODES.UNAUTHORIZED);
  });

  test("anything else is an unreachable service, never a sign-out", () => {
    assert.equal(startupErrorCode(new TypeError("Network request failed")), STARTUP_CODES.UNAVAILABLE);
    assert.equal(startupErrorCode({ status: 503 }), STARTUP_CODES.UNAVAILABLE);
    assert.equal(startupErrorCode(null), STARTUP_CODES.UNAVAILABLE);
  });
});