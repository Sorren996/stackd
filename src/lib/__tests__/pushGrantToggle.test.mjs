// The sharer's per-follower push switches: immediate feedback, isolated
// pending state, rollback only on a confirmed failure, and no late or stale
// reply undoing the newest choice.
//
// Run with:
//   node --test src/lib/__tests__/pushGrantToggle.test.mjs
//
// Fabricated values only. No pushes are sent, no user records are touched.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { initialPushState, pushGrantReducer, currentSeq } from "../sharing/pushGrantToggle.js";

const off = { low_glucose: false, urgent_low: false, above_range: false, missing_readings: true };

/** apply a tap and return the state plus the sequence its request must quote. */
const tap = (state, key, value) => {
  const next = pushGrantReducer(state, { type: "toggle", key, value });
  return { state: next, seq: currentSeq(next, key) };
};

describe("a switch answers immediately and stays where the server put it", () => {
  test("enabling reports on at once, then on after the server confirms", () => {
    const start = initialPushState(off, 4, "access_1");
    const tapped = tap(start, "urgent_low", true);
    assert.equal(tapped.state.push.urgent_low, true, "the switch answers before the request settles");
    assert.deepEqual(tapped.state.pending, ["urgent_low"], "only this switch is held");

    const saved = pushGrantReducer(tapped.state, {
      type: "saved", key: "urgent_low", seq: tapped.seq, version: 5,
      grants: { ...off, urgent_low: true },
    });
    assert.equal(saved.push.urgent_low, true, "it stays on");
    assert.deepEqual(saved.pending, []);
    assert.equal(saved.version, 5);
    // The list this screen reloads from carries the same value.
    const reopened = pushGrantReducer(saved, { type: "sync", id: "access_1", version: 5, grants: { ...off, urgent_low: true } });
    assert.equal(reopened.push.urgent_low, true, "and it is still on when the sheet is reopened");
  });

  test("disabling saves and stays off after reload", () => {
    const start = initialPushState({ ...off, urgent_low: true }, 5, "access_1");
    const tapped = tap(start, "urgent_low", false);
    assert.equal(tapped.state.push.urgent_low, false);
    const saved = pushGrantReducer(tapped.state, {
      type: "saved", key: "urgent_low", seq: tapped.seq, version: 6,
      grants: { ...off, urgent_low: false },
    });
    assert.equal(saved.push.urgent_low, false);
    const reopened = pushGrantReducer(saved, { type: "sync", id: "access_1", version: 6, grants: { ...off, urgent_low: false } });
    assert.equal(reopened.push.urgent_low, false);
  });
});

describe("the sharer's permission does not depend on the follower's choice", () => {
  test("a permission stays on even though the follower has not opted in", () => {
    // The follower's own opt-in is not part of this state at all: nothing in a
    // save or a sync can switch the sharer's permission off on their behalf.
    const start = initialPushState(off, 4, "access_1");
    const tapped = tap(start, "low_glucose", true);
    const saved = pushGrantReducer(tapped.state, {
      type: "saved", key: "low_glucose", seq: tapped.seq, version: 5,
      grants: { ...off, low_glucose: true },
    });
    const syncedWithNoFollowerOptIn = pushGrantReducer(saved, {
      type: "sync", id: "access_1", version: 5, grants: { ...off, low_glucose: true },
    });
    assert.equal(syncedWithNoFollowerOptIn.push.low_glucose, true);
  });
});

describe("a confirmed failure rolls that one switch back and leaves the rest alone", () => {
  test("the switch returns to where it was", () => {
    const start = initialPushState(off, 4, "access_1");
    const tapped = tap(start, "urgent_low", true);
    const failed = pushGrantReducer(tapped.state, {
      type: "failed", key: "urgent_low", seq: tapped.seq, previous: false,
    });
    assert.equal(failed.push.urgent_low, false, "nothing is reported as saved when it was not");
    assert.deepEqual(failed.pending, []);
  });

  test("another category's saved choice is untouched by that failure", () => {
    const start = initialPushState(off, 4, "access_1");
    const tapped = tap(start, "low_glucose", true);
    const saved = pushGrantReducer(tapped.state, {
      type: "saved", key: "low_glucose", seq: tapped.seq, version: 5, grants: { ...off, low_glucose: true },
    });
    const second = tap(saved, "urgent_low", true);
    const failed = pushGrantReducer(second.state, {
      type: "failed", key: "urgent_low", seq: second.seq, previous: false,
    });
    assert.equal(failed.push.urgent_low, false);
    assert.equal(failed.push.low_glucose, true, "the earlier committed choice survives");
  });
});

describe("rapid taps and stale data", () => {
  test("only the newest tap on a switch has the final word", () => {
    const start = initialPushState(off, 4, "access_1");
    const first = tap(start, "urgent_low", true);
    const settledFirst = { ...first.state, pending: [] }; // as if it were no longer held
    const second = tap(settledFirst, "urgent_low", false);
    assert.ok(second.seq > first.seq);

    // The first request answers late, after the second exists.
    const lateFirst = pushGrantReducer(second.state, {
      type: "saved", key: "urgent_low", seq: first.seq, version: 5, grants: { ...off, urgent_low: true },
    });
    assert.equal(lateFirst.push.urgent_low, false, "the late answer does not undo the newer tap");

    const final = pushGrantReducer(lateFirst, {
      type: "saved", key: "urgent_low", seq: second.seq, version: 6, grants: { ...off, urgent_low: false },
    });
    assert.equal(final.push.urgent_low, false);
  });

  test("a refetch read before the save completed cannot undo it", () => {
    const start = initialPushState(off, 4, "access_1");
    const tapped = tap(start, "urgent_low", true);
    const saved = pushGrantReducer(tapped.state, {
      type: "saved", key: "urgent_low", seq: tapped.seq, version: 5, grants: { ...off, urgent_low: true },
    });
    // A request issued before the save returns the older version.
    const stale = pushGrantReducer(saved, {
      type: "sync", id: "access_1", version: 4, grants: { ...off, urgent_low: false },
    });
    assert.equal(stale.push.urgent_low, true, "the confirmed permission is kept");
    assert.equal(stale.version, 5);
  });

  test("a refetch arriving mid-save keeps the switch the sharer just set", () => {
    const start = initialPushState(off, 4, "access_1");
    const tapped = tap(start, "urgent_low", true);
    const midFlight = pushGrantReducer(tapped.state, {
      type: "sync", id: "access_1", version: 4, grants: { ...off, urgent_low: false },
    });
    assert.equal(midFlight.push.urgent_low, true, "the tap is not flicked back while it is being saved");
    assert.equal(midFlight.push.missing_readings, true, "other permissions still refresh from the server");
  });
});

describe("relationships stay separate", () => {
  test("one follower's saved permission never lands on another", () => {
    const first = initialPushState({ urgent_low: true }, 5, "access_1");
    const second = pushGrantReducer(initialPushState({}, 2, "access_2"), {
      type: "sync", id: "access_2", version: 2, grants: {},
    });
    assert.equal(first.push.urgent_low, true);
    assert.notEqual(second.push.urgent_low, true);
  });

  test("switching to a different person replaces the state completely", () => {
    const first = initialPushState({ urgent_low: true }, 5, "access_1");
    const moved = pushGrantReducer(first, { type: "sync", id: "access_2", version: 1, grants: { below_range: true } });
    assert.equal(moved.push.urgent_low, undefined, "the previous person's permission is not carried over");
    assert.equal(moved.push.below_range, true);
    assert.equal(moved.id, "access_2");
  });
});