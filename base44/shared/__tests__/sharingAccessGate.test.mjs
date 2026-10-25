// The server-side gate: what a relationship is allowed to hand out.
//
// Run with:
//   node --test --experimental-strip-types base44/shared/__tests__/*.test.mjs
//
// Fabricated fixtures only. This asserts the rule every sharing function reads
// through, so pausing or withdrawing cannot depend on the client, the cache, or
// the write path having cleared anything.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  effectiveStatus,
  isAccessUsable,
  accessBlockReason,
  effectiveScopes,
  effectiveAlertScopes,
} from "../sharingCore.ts";

const access = (over = {}) => ({
  status: "active",
  sharer_user_id: "sharer_1",
  follower_user_id: "follower_1",
  permission_version: 2,
  scopes: { glucose: true, insulin: true, location: true, urgent_low_call: true },
  alert_scopes: { urgent_low_email: true, urgent_low_sms: true },
  ...over,
});

const allFalse = (record) => Object.values(record).every((v) => v === false);

describe("an active relationship is the only one that conveys anything", () => {
  test("active resolves to the stored scopes", () => {
    const row = access();
    assert.equal(effectiveStatus(row), "active");
    assert.equal(isAccessUsable(row), true);
    assert.equal(accessBlockReason(row), null);
    assert.equal(effectiveScopes(row).glucose, true);
    assert.equal(effectiveAlertScopes(row).urgent_low_email, true);
  });
});

describe("paused and withdrawn relationships cease authorizing reads", () => {
  // Pausing deliberately leaves the stored scopes untouched so the sharer can
  // resume with their choices intact — the gate itself must therefore refuse.
  test("paused blocks reads and hands out nothing, even with scopes stored on", () => {
    const row = access({ status: "paused" });
    assert.equal(effectiveStatus(row), "paused");
    assert.equal(isAccessUsable(row), false);
    assert.equal(accessBlockReason(row), "paused");
    assert.equal(allFalse(effectiveScopes(row)), true);
    assert.equal(allFalse(effectiveAlertScopes(row)), true);
  });

  test("revoked blocks reads and hands out nothing", () => {
    const row = access({ status: "revoked", scopes: {}, alert_scopes: {} });
    assert.equal(accessBlockReason(row), "revoked");
    assert.equal(allFalse(effectiveScopes(row)), true);
    assert.equal(allFalse(effectiveAlertScopes(row)), true);
  });

  test("expired and a missing row block reads too", () => {
    assert.equal(accessBlockReason(access({ status: "expired" })), "expired");
    assert.equal(accessBlockReason(null), "revoked");
    assert.equal(allFalse(effectiveScopes(null)), true);
  });

  test("a pending invitation conveys nothing", () => {
    const row = access({
      status: "pending",
      accepted_at: null,
      invitation_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    assert.equal(accessBlockReason(row), "pending");
    assert.equal(allFalse(effectiveScopes(row)), true);
  });

  test("an alert channel can never stay armed on a relationship that is not active", () => {
    const row = access({ status: "paused", alert_scopes: { urgent_low_email: true, urgent_low_sms: true } });
    const alerts = effectiveAlertScopes(row);
    assert.equal(alerts.urgent_low_email, false);
    assert.equal(alerts.urgent_low_sms, false);
  });
});