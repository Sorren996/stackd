// The sharer's per-follower push permission, end to end.
//
// Run with:
//   node --test base44/shared/__tests__/sharerPushGrants.test.mjs
//
// Fabricated fixtures only. No health values, no real users, no pushes.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { publicRelationship, loadOwnedRelationship } from "../sharingAccess.ts";
import { planSharerGrantUpdate } from "../sharerPushGrants.ts";
import { recipientAuthorized } from "../notificationRecipient.ts";
import {
  CATEGORY_KEYS,
  sharerGrants,
  applySharerGrantPatch,
  followerPushReady,
  effectiveFollowerCategories,
  relationshipAllowsPush,
} from "../notificationCore.ts";

const NOW = Date.parse("2026-11-07T00:00:00.000Z");

const relationship = (over = {}) => ({
  id: "access_1",
  sharer_user_id: "sharer_1",
  follower_user_id: "follower_1",
  invited_email: "follower@example.test",
  status: "active",
  permission_version: 2,
  scopes: { glucose: true, insulin: false, location: false, urgent_low_call: false },
  alert_scopes: { urgent_low_email: false, urgent_low_sms: false },
  push: {},
  ...over,
});

const grantedAll = () => Object.fromEntries(CATEGORY_KEYS.map((key) => [key, true]));
const grantedOnly = (key) => Object.fromEntries(CATEGORY_KEYS.map((k) => [k, k === key]));

describe("a saved push permission survives the round trip to the sharer's sheet", () => {
  test("every category the sharer can grant comes back from the relationship payload", () => {
    const row = relationship({ push: grantedOnly("custom_low") });
    const payload = publicRelationship(row, NOW);
    assert.equal(payload.push.custom_low, true, "the saved grant is reported back");
    assert.deepEqual(payload.push, sharerGrants(row), "the payload carries the canonical grant set");
  });

  test("a grant is not lost for the categories the sheet can switch", () => {
    const row = relationship({ push: grantedAll() });
    const payload = publicRelationship(row, NOW);
    for (const key of CATEGORY_KEYS) {
      assert.equal(payload.push[key], true, `${key} must survive serialization`);
    }
  });
});

describe("one category is changed without touching any other", () => {
  test("patching a category merges against the stored grants", () => {
    const stored = grantedOnly("low_glucose");
    const result = applySharerGrantPatch(stored, "urgent_low", true);
    assert.equal(result.error, undefined);
    assert.equal(result.grants.urgent_low, true);
    assert.equal(result.grants.low_glucose, true, "an unrelated granted category is preserved");
  });

  test("a truncated client copy can never revoke an unmentioned category", () => {
    const stored = grantedAll();
    // The old client posted the object it had; every category it did not know
    // about arrived missing and was written back as false.
    const result = applySharerGrantPatch(stored, "urgent_low", false);
    assert.equal(result.grants.urgent_low, false);
    assert.equal(result.grants.custom_high, true);
    assert.equal(result.grants.falling_fast, true);
    assert.equal(result.grants.low_glucose, true);
  });

  test("unknown categories and non-boolean values are refused", () => {
    assert.equal(applySharerGrantPatch(grantedAll(), "glucose", true).error, "invalid_grant_category");
    assert.equal(applySharerGrantPatch(grantedAll(), "urgent_low", "yes").error, "invalid_grant_value");
  });

  test("disabling a category is a real change and stays disabled", () => {
    const result = applySharerGrantPatch(grantedAll(), "urgent_low", false);
    assert.equal(result.grants.urgent_low, false);
    const payload = publicRelationship(relationship({ push: result.grants }), NOW);
    assert.equal(payload.push.urgent_low, false);
  });
});

describe("the sharer's permission is independent of the follower's own choice", () => {
  test("a granted category stays granted when the follower has not opted in", () => {
    const row = relationship({ push: grantedOnly("urgent_low") });
    assert.equal(sharerGrants(row).urgent_low, true, "the sharer's permission is unchanged");
    const effective = effectiveFollowerCategories(row, { urgent_low: false });
    assert.equal(effective.urgent_low, false, "and nothing is sent");
    assert.equal(followerPushReady({ master_enabled: false, categories: { urgent_low: true } }).urgent_low, false);
  });

  test("a follower can narrow but never widen what the sharer granted", () => {
    const row = relationship({ push: grantedOnly("missing_readings") });
    const effective = effectiveFollowerCategories(row, { missing_readings: true, urgent_low: true });
    assert.equal(effective.missing_readings, true);
    assert.equal(effective.urgent_low, false, "an ungranted category stays closed");
  });

  test("readiness reflects the follower's own stored opt-in", () => {
    const ready = followerPushReady({ master_enabled: true, categories: { urgent_low: true } });
    assert.equal(ready.urgent_low, true);
    assert.equal(ready.below_range, false);
    assert.equal(followerPushReady(null).urgent_low, false);
  });
});

const followerPrefs = (over = {}) => ({
  id: "prefs_1",
  user_id: "follower_1",
  shared_access_id: "access_1",
  master_enabled: true,
  categories: grantedAll(),
  ...over,
});

describe("an ended relationship conveys nothing, even with a live grant", () => {
  test("a revoked relationship fails the delivery-time check", () => {
    const row = relationship({ status: "revoked", push: grantedAll() });
    assert.equal(relationshipAllowsPush(row, NOW), false);
    assert.equal(recipientAuthorized(followerPrefs(), row, "sharer_1", "follower_1", ["urgent_low"], NOW), false);
  });

  test("a paused relationship fails the delivery-time check", () => {
    const row = relationship({ status: "paused", push: grantedAll() });
    assert.equal(relationshipAllowsPush(row, NOW), false);
    assert.equal(recipientAuthorized(followerPrefs(), row, "sharer_1", "follower_1", ["urgent_low"], NOW), false);
  });

  test("a withdrawn category stops the very next evaluation", () => {
    const granted = relationship({ push: grantedOnly("urgent_low") });
    assert.equal(recipientAuthorized(followerPrefs(), granted, "sharer_1", "follower_1", ["urgent_low"], NOW), true);
    const withdrawn = relationship({ push: grantedOnly("below_range"), permission_version: 3 });
    assert.equal(recipientAuthorized(followerPrefs(), withdrawn, "sharer_1", "follower_1", ["urgent_low"], NOW), false);
  });

  test("an active relationship with glucose switched off conveys no push", () => {
    const row = relationship({ scopes: { glucose: false }, push: grantedAll() });
    assert.equal(relationshipAllowsPush(row, NOW), false);
    assert.equal(recipientAuthorized(followerPrefs(), row, "sharer_1", "follower_1", ["urgent_low"], NOW), false);
  });

  test("a recipient that is not this relationship's follower is refused", () => {
    const row = relationship({ push: grantedAll() });
    assert.equal(recipientAuthorized(followerPrefs({ user_id: "someone_else" }), row, "sharer_1", "follower_1", ["urgent_low"], NOW), false);
    assert.equal(recipientAuthorized(followerPrefs(), row, "another_sharer", "follower_1", ["urgent_low"], NOW), false);
  });
});

describe("the server decides what a request is allowed to do", () => {
  test("one category is changed while every other permission is kept", () => {
    const row = relationship({ push: grantedOnly("low_glucose") });
    const plan = planSharerGrantUpdate(row, { category: "urgent_low", value: true }, NOW);
    assert.equal(plan.error, undefined);
    assert.equal(plan.changed, true);
    assert.equal(plan.grants.urgent_low, true);
    assert.equal(plan.grants.low_glucose, true);
  });

  test("a tap that changes nothing is reported as unchanged, so nothing is written", () => {
    const row = relationship({ push: grantedOnly("urgent_low") });
    const plan = planSharerGrantUpdate(row, { category: "urgent_low", value: true }, NOW);
    assert.equal(plan.changed, false, "the permission version must not churn on a no-op");
  });

  test("an invited relationship may be configured ahead of acceptance", () => {
    const row = relationship({ status: "pending", follower_user_id: null, push: {} });
    const plan = planSharerGrantUpdate(row, { category: "urgent_low", value: true }, NOW);
    assert.equal(plan.error, undefined);
    assert.equal(plan.grants.urgent_low, true);
  });

  test("a revoked relationship is refused", () => {
    const plan = planSharerGrantUpdate(relationship({ status: "revoked" }), { category: "urgent_low", value: true }, NOW);
    assert.equal(plan.error, "revoked");
    assert.equal(plan.grants, undefined, "nothing is described for a refused request");
  });

  test("an expired invitation is refused", () => {
    const row = relationship({ status: "pending", invitation_expires_at: "2026-11-01T00:00:00.000Z" });
    const plan = planSharerGrantUpdate(row, { category: "urgent_low", value: true }, NOW);
    assert.equal(plan.error, "expired");
  });

  test("an unknown category or a non-boolean value is refused", () => {
    const row = relationship({ push: {} });
    assert.equal(planSharerGrantUpdate(row, { category: "glucose", value: true }, NOW).error, "invalid_grant_category");
    assert.equal(planSharerGrantUpdate(row, { category: "urgent_low", value: 1 }, NOW).error, "invalid_grant_value");
    assert.equal(planSharerGrantUpdate(row, null, NOW).error, "invalid_grant_category");
  });
});

describe("only the owner of the relationship may change it", () => {
  const fakeBase44 = (row) => ({
    asServiceRole: { entities: { SharedAccess: { get: async (id) => { if (id !== row.id) throw new Error("404"); return row; } } } },
  });

  test("an unrelated sharer is refused", async () => {
    const row = relationship({ push: {} });
    const result = await loadOwnedRelationship(fakeBase44(row), "intruder", "access_1");
    assert.equal(result.error, "forbidden");
    assert.equal(result.access, undefined);
  });

  test("a missing or unknown relationship is refused", async () => {
    const row = relationship({ push: {} });
    assert.equal((await loadOwnedRelationship(fakeBase44(row), "sharer_1", "")).error, "missing_access_id");
    assert.equal((await loadOwnedRelationship(fakeBase44(row), "sharer_1", "access_9")).error, "not_found");
  });

  test("the owner of this relationship is allowed", async () => {
    const row = relationship({ push: {} });
    const result = await loadOwnedRelationship(fakeBase44(row), "sharer_1", "access_1");
    assert.equal(result.error, undefined);
    assert.equal(result.access.id, "access_1");
  });
});

describe("two followers are told apart", () => {
  test("permissions saved for one follower never appear on another", () => {
    const first = relationship({ id: "access_1", follower_user_id: "follower_1", push: grantedOnly("urgent_low") });
    const second = relationship({ id: "access_2", follower_user_id: "follower_2", invited_email: "two@example.test", push: {} });
    assert.equal(publicRelationship(first, NOW).push.urgent_low, true);
    assert.equal(publicRelationship(second, NOW).push.urgent_low, false);
  });
});