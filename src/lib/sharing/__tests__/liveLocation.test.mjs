// The foreground location updater's rules.
//
// Run with:
//   node --test src/lib/sharing/__tests__/liveLocation.test.mjs
//
// Fabricated fixtures only. Nothing here touches the network, the device or the
// database: these are the decisions the component then acts on, so that "may
// this position be published right now?" has one answer that can be inspected.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  LIVE_LOCATION_MIN_INTERVAL_MS,
  hasActiveLocationFollower,
  shouldPublishLocation,
  observedAtFromFix,
} from "../liveLocation.js";

const NOW = new Date("2026-10-25T18:00:00.000Z").getTime();

/** Everything satisfied — each test removes exactly one thing. */
const allowed = {
  enabled: true,
  hasLocationFollower: true,
  visible: true,
  geolocationAvailable: true,
  permissionState: "granted",
  permissionPrompted: false,
  online: true,
  inFlight: false,
  lastPublishedAt: null,
  now: NOW,
};

const decide = (overrides = {}) => shouldPublishLocation({ ...allowed, ...overrides });

describe("who counts as a location follower", () => {
  test("an active relationship with the location scope is one", () => {
    assert.equal(hasActiveLocationFollower([{ status: "active", scopes: { location: true } }]), true);
  });

  test("nothing else is — pending, paused, expired, revoked, or another scope only", () => {
    for (const status of ["pending", "paused", "expired", "revoked"]) {
      assert.equal(hasActiveLocationFollower([{ status, scopes: { location: true } }]), false, status);
    }
    assert.equal(hasActiveLocationFollower([{ status: "active", scopes: { glucose: true } }]), false);
    assert.equal(hasActiveLocationFollower([{ status: "active", scopes: { location: "true" } }]), false);
    assert.equal(hasActiveLocationFollower([{ status: "active" }]), false);
    assert.equal(hasActiveLocationFollower([]), false);
    assert.equal(hasActiveLocationFollower(null), false);
  });

  test("one usable follower among several is enough", () => {
    assert.equal(
      hasActiveLocationFollower([
        { status: "revoked", scopes: { location: true } },
        { status: "active", scopes: { location: true } },
      ]),
      true
    );
  });
});

describe("may a position be published right now", () => {
  test("publishes only when everything is satisfied", () => {
    assert.deepEqual(decide(), { publish: true, reason: null });
  });

  test("without the person's own opt-in, nothing happens", () => {
    assert.deepEqual(decide({ enabled: false }), { publish: false, reason: "not_enabled" });
  });

  test("with nobody holding the location scope, nothing happens", () => {
    const r = decide({ hasLocationFollower: false });
    assert.equal(r.publish, false);
    assert.equal(r.reason, "no_active_location_scope");
  });

  test("a hidden app never collects a position", () => {
    assert.deepEqual(decide({ visible: false }), { publish: false, reason: "hidden" });
  });

  test("a refused permission stops it for good, even with everything else ready", () => {
    assert.deepEqual(decide({ permissionState: "denied" }), { publish: false, reason: "permission_denied" });
  });

  test("a prompt already shown is not shown again", () => {
    assert.deepEqual(decide({ permissionState: "prompt", permissionPrompted: true }), {
      publish: false,
      reason: "permission_pending",
    });
    // The first attempt, before anything has been asked, is allowed through.
    assert.deepEqual(decide({ permissionState: "prompt", permissionPrompted: false }), {
      publish: true,
      reason: null,
    });
  });

  test("an offline device, an unsupported device and a request in flight all wait", () => {
    assert.deepEqual(decide({ online: false }), { publish: false, reason: "offline" });
    assert.deepEqual(decide({ geolocationAvailable: false }), { publish: false, reason: "unsupported" });
    assert.deepEqual(decide({ inFlight: true }), { publish: false, reason: "already_running" });
  });

  test("it is throttled to one position per interval", () => {
    assert.deepEqual(decide({ lastPublishedAt: NOW - 1000 }), { publish: false, reason: "throttled" });
    assert.deepEqual(
      decide({ lastPublishedAt: NOW - (LIVE_LOCATION_MIN_INTERVAL_MS - 1) }),
      { publish: false, reason: "throttled" }
    );
    assert.deepEqual(decide({ lastPublishedAt: NOW - LIVE_LOCATION_MIN_INTERVAL_MS }), {
      publish: true,
      reason: null,
    });
    assert.deepEqual(decide({ lastPublishedAt: NOW - LIVE_LOCATION_MIN_INTERVAL_MS * 3 }), {
      publish: true,
      reason: null,
    });
  });

  test("with no defaults at all it refuses rather than assuming", () => {
    assert.equal(shouldPublishLocation().publish, false);
    assert.equal(shouldPublishLocation().reason, "not_enabled");
  });
});

describe("the position's own observation time", () => {
  test("a current device fix is passed through as its own time", () => {
    const fix = NOW - 90 * 1000;
    assert.equal(observedAtFromFix(fix, NOW), new Date(fix).toISOString());
  });

  test("a fix claiming to be in the future is discarded", () => {
    assert.equal(observedAtFromFix(NOW + 5000, NOW), null);
  });

  test("a fix too old to be current is discarded, so an old position is never relabelled as new", () => {
    assert.equal(observedAtFromFix(NOW - 6 * 60 * 1000, NOW), null);
    assert.ok(observedAtFromFix(NOW - 4 * 60 * 1000, NOW));
  });

  test("a fix with no usable time yields nothing rather than a guess", () => {
    assert.equal(observedAtFromFix(0, NOW), null);
    assert.equal(observedAtFromFix(null, NOW), null);
    assert.equal(observedAtFromFix(undefined, NOW), null);
    assert.equal(observedAtFromFix("not a time", NOW), null);
    assert.equal(observedAtFromFix(NaN, NOW), null);
  });
});