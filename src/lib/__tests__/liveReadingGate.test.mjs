// Tests for the launch/cache freshness gate.
//
// Run with:
//   node --test --experimental-strip-types src/lib/__tests__/

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { LIVE_READING, LIVE_READING_DEADLINE_MS, liveReadingState } from "../liveReadingGate.js";

describe("liveReadingState", () => {
  test("a window with no opening time is always current", () => {
    assert.equal(
      liveReadingState({ dataUpdatedAt: 0, revalidatedAt: undefined }),
      LIVE_READING.CURRENT
    );
  });

  test("a cached value older than the confirmation window is pending", () => {
    assert.equal(
      liveReadingState({ dataUpdatedAt: 1_000, revalidatedAt: 5_000 }),
      LIVE_READING.PENDING
    );
  });

  test("data received after the window opened is current, even if identical", () => {
    // A successful server read can legitimately return the same observation.
    assert.equal(
      liveReadingState({ dataUpdatedAt: 5_000, revalidatedAt: 5_000 }),
      LIVE_READING.CURRENT
    );
  });

  test("after the bounded wait an unconfirmed reading is unverified, not current", () => {
    assert.equal(
      liveReadingState({ dataUpdatedAt: 1_000, revalidatedAt: 5_000, deadlineElapsed: true }),
      LIVE_READING.UNVERIFIED
    );
  });

  test("a failed read leaves the reading unconfirmed rather than fresh", () => {
    assert.equal(
      liveReadingState({ dataUpdatedAt: 0, revalidatedAt: 5_000, deadlineElapsed: true }),
      LIVE_READING.UNVERIFIED
    );
  });

  test("the deadline is a finite technical bound", () => {
    assert.ok(Number.isFinite(LIVE_READING_DEADLINE_MS) && LIVE_READING_DEADLINE_MS > 0);
  });
});