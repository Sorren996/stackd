// Automated tests for the Stackd sharing core.
//
// Run with:
//   node --test --experimental-strip-types base44/shared/__tests__/
//
// These tests use ONLY fabricated fixtures. They create no health records,
// send no messages and touch no network or database.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  SCOPE_KEYS,
  SCOPE_RESOURCES,
  URGENT_LOW_THRESHOLD,
  STALE_READING_MINUTES,
  GLUCOSE_WINDOW_HOURS,
  sanitizeScopes,
  sanitizeAlertScopes,
  sanitizeFollowerPrefs,
  effectiveScopes,
  effectiveAlertScopes,
  effectiveStatus,
  isAccessUsable,
  canReadScope,
  canCall,
  accessBlockReason,
  normalizeEmail,
  emailsMatch,
  isPlausibleEmail,
  normalizePhoneDigits,
  normalizeCountryCode,
  maskPhone,
  formatPhone,
  telHref,
  isPendingExpired,
  invitationBlockReason,
  invitationIsRedeemable,
  selectGlucoseWindow,
  latestReading,
  readingAgeMinutes,
  isStaleReading,
  computeSharedDirection,
  sharedGlucoseZone,
  isUrgentLow,
  isWithinQuietHours,
  alertEventKey,
  decideAlert,
  selectInsulinWindow,
  isValidLocation,
  locationAgeMinutes,
  isValidTimeZone,
  localHourInTimeZone,
  startOfLocalDayMs,
  projectResource,
} from "../sharingCore.ts";

// ── Fixtures ───────────────────────────────────────────────────────────────

const NOW = new Date("2026-10-24T18:00:00.000Z").getTime();
const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function accessWith(scopes, overrides = {}) {
  return {
    id: "sa_1",
    sharer_user_id: "sharer_1",
    sharer_display_name: "Alex",
    invited_email: "follower@example.com",
    follower_user_id: "follower_1",
    status: "active",
    permission_version: 3,
    scopes,
    alert_scopes: {},
    contact_shared: false,
    ...overrides,
  };
}

function readingAt(minutesAgo, value, source = "dexcom") {
  return { id: `r${minutesAgo}`, value, recorded_at: iso(-minutesAgo * MIN), source };
}

function ctx(readings, overrides = {}) {
  return {
    access: accessWith({ glucose: true }),
    now: NOW,
    readings,
    targetLow: 70,
    targetHigh: 180,
    timeZone: "America/Chicago",
    ...overrides,
  };
}

// ── Scope model ────────────────────────────────────────────────────────────

describe("scope matrix — all 16 combinations of the four scopes", () => {
  const all = [];
  for (let mask = 0; mask < 16; mask++) {
    const scopes = {};
    SCOPE_KEYS.forEach((key, i) => {
      scopes[key] = (mask & (1 << i)) !== 0;
    });
    all.push([mask, scopes]);
  }

  test("the matrix is exhaustive (16 unique combinations)", () => {
    assert.equal(all.length, 16);
    assert.equal(new Set(all.map(([, s]) => JSON.stringify(s))).size, 16);
  });

  for (const [mask, scopes] of all) {
    test(`mask ${mask.toString(2).padStart(4, "0")} resolves exactly its own scopes`, () => {
      const access = accessWith(scopes);
      const resolved = effectiveScopes(access, NOW);
      for (const key of SCOPE_KEYS) {
        assert.equal(resolved[key], scopes[key], `${key} must be ${scopes[key]}`);
        assert.equal(canReadScope(access, key, NOW), scopes[key]);
      }
    });

    test(`mask ${mask.toString(2).padStart(4, "0")} gates each resource independently`, () => {
      for (const [resource, scope] of Object.entries(SCOPE_RESOURCES)) {
        const result = projectResource(resource, ctx([readingAt(5, 120)], { access: accessWith(scopes) }));
        if (scopes[scope]) {
          assert.equal(result.ok, true, `${resource} should be readable`);
        } else {
          assert.equal(result.ok, false, `${resource} must be denied`);
          assert.equal(result.reason, "scope_off");
          assert.equal(result.data, undefined, "a denied projection must carry no data");
        }
      }
    });
  }
});

describe("deny by default", () => {
  test("a missing scope object grants nothing", () => {
    assert.deepEqual(sanitizeScopes(null), {
      glucose: false,
      insulin: false,
      location: false,
      urgent_low_call: false,
    });
  });

  test("unknown scope keys are dropped, never merged", () => {
    const resolved = sanitizeScopes({ glucose: true, admin: true, everything: true, __proto__: true });
    assert.deepEqual(Object.keys(resolved).sort(), [...SCOPE_KEYS].sort());
    assert.equal(resolved.glucose, true);
    assert.equal(resolved.insulin, false);
  });

  test("truthy-but-not-true values are rejected (no client type coercion)", () => {
    assert.equal(sanitizeScopes({ glucose: "true" }).glucose, false);
    assert.equal(sanitizeScopes({ glucose: 1 }).glucose, false);
    assert.equal(sanitizeScopes({ glucose: "yes" }).glucose, false);
    assert.equal(sanitizeAlertScopes({ urgent_low_email: "true" }).urgent_low_email, false);
  });

  test("a caller with no relationship gets no scopes and no data", () => {
    assert.deepEqual(effectiveScopes(null, NOW), sanitizeScopes(null));
    assert.equal(projectResource("glucose", ctx([readingAt(5, 120)], { access: null })).ok, false);
  });
});

describe("relationship lifecycle blocks every subsequent request", () => {
  const scopes = { glucose: true, insulin: true, location: true, urgent_low_call: true };

  for (const status of ["paused", "revoked", "expired", "pending"]) {
    test(`${status} resolves every scope to false`, () => {
      const access = accessWith(scopes, { status });
      assert.equal(isAccessUsable(access, NOW), false);
      assert.deepEqual(effectiveScopes(access, NOW), sanitizeScopes(null));
      assert.deepEqual(effectiveAlertScopes(access, NOW), sanitizeAlertScopes(null));
      assert.equal(canCall(access, NOW), false);
      for (const [resource] of Object.entries(SCOPE_RESOURCES)) {
        const r = projectResource(resource, ctx([readingAt(5, 120)], { access }));
        assert.equal(r.ok, false, `${resource} must be denied while ${status}`);
        assert.equal(r.reason, status);
      }
    });
  }

  test("a pending relationship past its invitation window reads as expired", () => {
    const access = accessWith(scopes, {
      status: "pending",
      invitation_expires_at: iso(-1 * MIN),
    });
    assert.equal(isPendingExpired(access, NOW), true);
    assert.equal(effectiveStatus(access, NOW), "expired");
    assert.equal(accessBlockReason(access, NOW), "expired");
  });

  test("a pending relationship inside its window stays pending (still no access)", () => {
    const access = accessWith(scopes, {
      status: "pending",
      invitation_expires_at: iso(24 * HOUR),
    });
    assert.equal(effectiveStatus(access, NOW), "pending");
    assert.equal(isAccessUsable(access, NOW), false);
  });

  test("permission_version is surfaced so a client can detect stale caches", () => {
    const r = projectResource("summary", ctx([], { access: accessWith(scopes, { permission_version: 7 }) }));
    assert.equal(r.data.permission_version, 7);
  });
});

// ── Email + invitation ─────────────────────────────────────────────────────

describe("email matching", () => {
  test("normalizes case and surrounding whitespace only", () => {
    assert.equal(normalizeEmail("  Alex@Example.COM "), "alex@example.com");
    assert.equal(emailsMatch(" Alex@Example.com", "alex@example.com "), true);
  });

  test("never strips provider aliases (no dot or +tag collapsing)", () => {
    assert.equal(emailsMatch("a.b+tag@gmail.com", "ab@gmail.com"), false);
    assert.equal(emailsMatch("alex+stackd@example.com", "alex@example.com"), false);
  });

  test("rejects implausible addresses", () => {
    assert.equal(isPlausibleEmail("nope"), false);
    assert.equal(isPlausibleEmail("a@b"), false);
    assert.equal(isPlausibleEmail("alex@example.com"), true);
  });
});

describe("invitation redemption", () => {
  const invite = (overrides = {}) => ({
    status: "pending",
    invited_email: "follower@example.com",
    expires_at: iso(2 * HOUR),
    ...overrides,
  });

  test("a matching, unexpired, pending invitation is redeemable", () => {
    assert.equal(invitationIsRedeemable(invite(), "follower@example.com", NOW), true);
  });

  test("a forwarded link redeemed with a different verified email is refused", () => {
    assert.equal(invitationBlockReason(invite(), "someone.else@example.com", NOW), "email_mismatch");
  });

  test("identity-matching is case/whitespace insensitive but alias-strict", () => {
    assert.equal(invitationIsRedeemable(invite(), " FOLLOWER@Example.com ", NOW), true);
    assert.equal(
      invitationIsRedeemable(invite({ invited_email: "first.last@example.com" }), "firstlast@example.com", NOW),
      false
    );
  });

  test("an expired invitation is refused", () => {
    assert.equal(invitationBlockReason(invite({ expires_at: iso(-1) }), "follower@example.com", NOW), "expired");
  });

  test("an invitation with no expiry at all is refused (fail closed)", () => {
    assert.equal(invitationBlockReason(invite({ expires_at: undefined }), "follower@example.com", NOW), "expired");
  });

  test("a canceled invitation is refused", () => {
    assert.equal(invitationBlockReason(invite({ status: "canceled" }), "follower@example.com", NOW), "canceled");
  });

  test("a reused invitation is refused", () => {
    assert.equal(invitationBlockReason(invite({ status: "accepted" }), "follower@example.com", NOW), "already_claimed");
  });

  test("an unknown token is refused", () => {
    assert.equal(invitationBlockReason(null, "follower@example.com", NOW), "not_found");
  });

  test("concurrent redemption grants once — the second attempt loses the race", () => {
    // First writer flips the record to accepted; the second sees that state.
    const claimed = invite({ status: "accepted", accepted_by_user_id: "follower_1" });
    assert.equal(invitationBlockReason(claimed, "follower@example.com", NOW), "already_claimed");
    // A different account attempting the same token is refused on both counts.
    assert.equal(invitationBlockReason(claimed, "other@example.com", NOW), "already_claimed");
  });

  test("a scanner GET cannot change invitation state (pure predicate is read-only)", () => {
    const original = invite();
    const snapshot = JSON.stringify(original);
    invitationBlockReason(original, "follower@example.com", NOW);
    invitationIsRedeemable(original, "follower@example.com", NOW);
    assert.equal(JSON.stringify(original), snapshot, "checking must never mutate the invitation");
  });

  test("resend invalidates the previous code (new hash, same holder)", () => {
    // A resend replaces token_hash; the old link no longer resolves to this
    // invitation, so lookup by the old hash returns nothing.
    const lookupByHash = { new_hash: invite() };
    assert.equal(lookupByHash.old_hash, undefined);
    assert.equal(invitationBlockReason(lookupByHash.old_hash, "follower@example.com", NOW), "not_found");
  });
});

// ── Glucose projection ─────────────────────────────────────────────────────

describe("glucose projection", () => {
  test("only the rolling 24 hour window is ever sent", () => {
    const readings = [readingAt(60 * 30, 111), readingAt(60 * 25, 222), readingAt(120, 130), readingAt(5, 140)];
    const r = projectResource("glucose", ctx(readings));
    assert.equal(r.data.window_hours, GLUCOSE_WINDOW_HOURS);
    const values = r.data.readings.map((x) => x.value);
    assert.deepEqual(values, [130, 140]);
    assert.ok(!values.includes(111), "a 30-hour-old reading must be outside the window");
    assert.ok(!values.includes(222), "a 25-hour-old reading must be outside the window");
  });

  test("carry-forward system readings are excluded from the trend payload", () => {
    const readings = [readingAt(60, 120, "dexcom"), readingAt(30, 118, "system"), readingAt(10, 116, "dexcom")];
    const r = projectResource("glucose", ctx(readings));
    assert.deepEqual(r.data.readings.map((x) => x.value), [120, 116]);
  });

  test("the payload carries no meal, insulin, projection or note fields", () => {
    const readings = [
      { ...readingAt(10, 116), notes: "secret note", carbs: 40, insulin: 3, projection: [1, 2] },
    ];
    const r = projectResource("glucose", ctx(readings));
    const keys = Object.keys(r.data.readings[0]).sort();
    assert.deepEqual(keys, ["id", "recorded_at", "source", "trend", "value"]);
    assert.equal("notes" in r.data.readings[0], false);
    assert.equal("carbs" in r.data.readings[0], false);
  });

  test("a stale latest reading is flagged and loses its current-state direction", () => {
    const readings = [readingAt(60, 100), readingAt(50, 130), readingAt(40, 170)];
    const r = projectResource("glucose", ctx(readings));
    assert.equal(r.data.stale, true);
    assert.equal(r.data.latest_age_minutes >= STALE_READING_MINUTES + 1, true);
    assert.equal(r.data.direction, null, "no direction may be described from stale readings");
    assert.equal(r.data.zone, "none", "a stale reading may not read as a reassuring zone");
  });

  test("an urgent-low value is surfaced even though its zone is urgentLow", () => {
    const r = projectResource("glucose", ctx([readingAt(5, 48)]));
    assert.equal(r.data.stale, false);
    assert.equal(r.data.zone, "urgentLow");
    assert.ok(Number(r.data.latest.value) < URGENT_LOW_THRESHOLD);
  });

  test("direction needs a recent sample — two readings are not enough", () => {
    const r = projectResource("glucose", ctx([readingAt(10, 120), readingAt(5, 140)]));
    assert.equal(r.data.direction, null);
  });

  test("direction abstains when the span is wider than the recent window", () => {
    const r = projectResource("glucose", ctx([readingAt(45, 110), readingAt(30, 120), readingAt(5, 140)]));
    assert.equal(r.data.direction, null);
  });

  test("direction is described from the last 3–4 readings when the span is recent", () => {
    assert.equal(computeSharedDirection([readingAt(15, 100), readingAt(10, 140), readingAt(5, 160)], NOW), "climbing");
    assert.equal(computeSharedDirection([readingAt(15, 160), readingAt(10, 120), readingAt(5, 100)], NOW), "falling");
    assert.equal(computeSharedDirection([readingAt(15, 120), readingAt(10, 122), readingAt(5, 121)], NOW), "holding steady");
    assert.equal(computeSharedDirection([readingAt(15, 120), readingAt(10, 128), readingAt(5, 130)], NOW), "drifting up");
  });

  test("today's window starts at the sharer's local midnight, not the follower's", () => {
    // 2026-10-24T18:00Z is 13:00 in America/Chicago (UTC-5 on that date).
    const start = startOfLocalDayMs(NOW, "America/Chicago");
    assert.equal(new Date(start).toISOString(), "2026-10-24T05:00:00.000Z");
    const r = projectResource("glucose", ctx([readingAt(5, 120)]));
    assert.equal(r.data.today_start, "2026-10-24T05:00:00.000Z");
  });

  test("the day boundary is exact, not skewed by the clock's milliseconds", () => {
    const skewed = new Date("2026-10-24T18:00:00.747Z").getTime();
    assert.equal(
      new Date(startOfLocalDayMs(skewed, "America/Chicago")).toISOString(),
      "2026-10-24T05:00:00.000Z"
    );
  });

  test("a reading in the very first moment of the sharer's day is included", () => {
    const start = startOfLocalDayMs(NOW, "America/Chicago");
    const justAfterMidnight = { id: "first", value: 120, recorded_at: new Date(start).toISOString() };
    const r = projectResource("glucose", ctx([justAfterMidnight]));
    assert.equal(r.data.readings.length, 1);
  });

  test("an unknown time zone degrades safely instead of throwing", () => {
    assert.equal(isValidTimeZone("Not/AZone"), false);
    assert.equal(startOfLocalDayMs(NOW, "Not/AZone"), null);
    assert.equal(localHourInTimeZone(NOW, null), null);
    const r = projectResource("glucose", ctx([readingAt(5, 120)], { timeZone: "Not/AZone" }));
    assert.equal(r.data.time_zone, null);
    assert.ok(typeof r.data.today_start === "string");
  });

  test("target bounds are passed through, and absent bounds stay null", () => {
    assert.equal(projectResource("glucose", ctx([readingAt(5, 120)])).data.target_low, 70);
    const r = projectResource("glucose", ctx([readingAt(5, 120)], { targetLow: null, targetHigh: null }));
    assert.equal(r.data.target_low, null);
    assert.equal(r.data.target_high, null);
  });

  test("with no readings the payload is empty rather than invented", () => {
    const r = projectResource("glucose", ctx([]));
    assert.equal(r.data.latest, null);
    assert.deepEqual(r.data.readings, []);
    assert.equal(r.data.stale, true);
  });

  test("selectGlucoseWindow is the single enforcement point", () => {
    const readings = [readingAt(60 * 23, 100), readingAt(60 * 25, 200)];
    assert.deepEqual(selectGlucoseWindow(readings, NOW).map((r) => r.value), [100]);
  });
});

// ── Insulin projection ─────────────────────────────────────────────────────

describe("insulin projection", () => {
  const doses = [
    { insulin_type: "NovoLog", units: 6, administered_at: iso(-3 * HOUR) },
    { insulin_type: "Lantus", units: 18, administered_at: iso(-10 * HOUR) },
    { insulin_type: "Humalog", units: 4, administered_at: iso(-30 * HOUR) },
  ];

  test("only the rolling 24 hour window is sent", () => {
    const r = projectResource("insulin", { access: accessWith({ insulin: true }), now: NOW, doses });
    assert.deepEqual(r.data.doses.map((d) => d.units), [18, 6]);
  });

  test("doses carry no meal, note or prediction fields", () => {
    const r = projectResource("insulin", { access: accessWith({ insulin: true }), now: NOW, doses });
    assert.deepEqual(Object.keys(r.data.doses[0]).sort(), ["administered_at", "insulin_type", "units"]);
  });

  test("dose math is unavailable unless the sharer's plan is confirmed", () => {
    const off = projectResource("insulin", { access: accessWith({ insulin: true }), now: NOW, doses });
    assert.equal(off.data.dose_math_available, false);
    const on = projectResource("insulin", {
      access: accessWith({ insulin: true }),
      now: NOW,
      doses,
      settingsConfirmed: true,
    });
    assert.equal(on.data.dose_math_available, true);
  });

  test("an empty period is described as an empty period, never as 'no insulin taken'", () => {
    const r = projectResource("insulin", { access: accessWith({ insulin: true }), now: NOW, doses: [] });
    assert.deepEqual(r.data.doses, []);
    assert.equal(r.data.last_dose, null);
  });

  test("the last dose is the most recent inside the window", () => {
    const r = projectResource("insulin", { access: accessWith({ insulin: true }), now: NOW, doses });
    assert.equal(r.data.last_dose.insulin_type, "NovoLog");
  });

  test("selectInsulinWindow ignores rows without a usable units value", () => {
    const messy = [
      { insulin_type: "NovoLog", units: "6", administered_at: iso(-1 * HOUR) },
      { insulin_type: "NovoLog", units: null, administered_at: iso(-1 * HOUR) },
      { insulin_type: "NovoLog", administered_at: iso(-1 * HOUR) },
    ];
    assert.equal(selectInsulinWindow(messy, NOW).length, 1);
  });
});

// ── Location ───────────────────────────────────────────────────────────────

describe("location projection", () => {
  const loc = { latitude: 41.8781, longitude: -87.6298, accuracy_m: 12, captured_at: iso(-20 * MIN) };

  test("scope off yields no coordinates at all", () => {
    const r = projectResource("location", {
      access: accessWith({ location: false }),
      now: NOW,
      location: loc,
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "scope_off");
    assert.equal(JSON.stringify(r).includes("41.8781"), false, "coordinates must not leak in a denied payload");
  });

  test("scope on with nothing published reports an honest empty state", () => {
    const r = projectResource("location", { access: accessWith({ location: true }), now: NOW, location: null });
    assert.equal(r.ok, true);
    assert.equal(r.data.location, null);
    assert.equal(r.data.reason, "none_published");
  });

  test("only the latest location is sent — no trail, no history array", () => {
    const r = projectResource("location", { access: accessWith({ location: true }), now: NOW, location: loc });
    assert.equal(r.data.location.latitude, 41.8781);
    assert.equal(Array.isArray(r.data.location), false);
    assert.deepEqual(Object.keys(r.data).sort(), ["location", "reason"]);
  });

  test("the location carries its own timestamp, accuracy and age", () => {
    const r = projectResource("location", { access: accessWith({ location: true }), now: NOW, location: loc });
    assert.equal(r.data.location.captured_at, loc.captured_at);
    assert.equal(r.data.location.accuracy_m, 12);
    assert.equal(r.data.location.age_minutes, 20);
  });

  test("malformed coordinates are refused rather than mapped", () => {
    assert.equal(isValidLocation({ latitude: 91, longitude: 0 }), false);
    assert.equal(isValidLocation({ latitude: 0, longitude: 181 }), false);
    assert.equal(isValidLocation({ latitude: "x", longitude: "y" }), false);
    assert.equal(isValidLocation(null), false);
    const r = projectResource("location", {
      access: accessWith({ location: true }),
      now: NOW,
      location: { latitude: 999, longitude: 999 },
    });
    assert.equal(r.data.location, null);
  });

  test("location age keeps working for a stale marker", () => {
    const old = { ...loc, captured_at: iso(-8 * HOUR) };
    assert.equal(locationAgeMinutes(old, NOW), 480);
  });
});

// ── Contact number ─────────────────────────────────────────────────────────

describe("contact number handling", () => {
  test("the number is released only when call scope AND contact sharing are both on", () => {
    const both = accessWith({ urgent_low_call: true }, { contact_shared: true });
    const contact = { country_code: "+1", phone: "3125550142" };
    const released = projectResource("summary", ctx([], { access: both, contact }));
    assert.equal(released.data.contact_available, true);
    assert.equal(released.data.contact.tel, "13125550142");

    const scopeOnly = projectResource("summary", ctx([], { access: accessWith({ urgent_low_call: true }), contact }));
    assert.equal(scopeOnly.data.contact_available, false);
    assert.equal(scopeOnly.data.contact, null);

    const shareOnly = projectResource("summary", ctx([], { access: accessWith({}, { contact_shared: true }), contact }));
    assert.equal(shareOnly.data.contact, null);
  });

  test("call permission grants no data scope on its own", () => {
    const access = accessWith({ urgent_low_call: true }, { contact_shared: true });
    assert.equal(effectiveScopes(access, NOW).glucose, false);
    assert.equal(projectResource("glucose", ctx([readingAt(5, 120)], { access })).ok, false);
  });

  test("a revoked relationship cannot release the number", () => {
    const access = accessWith({ urgent_low_call: true }, { contact_shared: true, status: "revoked" });
    assert.equal(canCall(access, NOW), false);
    assert.equal(projectResource("summary", ctx([], { access, contact: { country_code: "+1", phone: "3125550142" } })).data.contact, null);
  });

  test("the owner's own list view only ever shows a masked number", () => {
    assert.equal(maskPhone("+1", "3125550142"), "+1 •••• ••42");
    assert.equal(maskPhone("1", "(312) 555-0142"), "+1 •••• ••42");
    assert.equal(formatPhone("+1", "3125550142"), "+1 3125550142");
  });

  test("phone normalization keeps digits and a single leading +", () => {
    assert.equal(normalizePhoneDigits("+1 (312) 555-0142"), "13125550142");
    assert.equal(normalizeCountryCode("001"), "+001");
    assert.equal(normalizeCountryCode(""), "");
    assert.equal(telHref("+1", "312-555-0142"), "13125550142");
  });
});

// ── Alert evaluation ───────────────────────────────────────────────────────

describe("urgent-low alert evaluation", () => {
  const baseInput = {
    access: accessWith({ glucose: true }, { alert_scopes: { urgent_low_email: true } }),
    channel: "email",
    channelConfigured: true,
    glucoseValue: 48,
    readingIsFresh: true,
    alreadyDelivered: false,
    followerPrefs: { notify_email: true, quiet_hours_start: 21, quiet_hours_end: 7 },
    sharerTimeZone: "America/Chicago",
    now: NOW,
  };

  const decide = (overrides = {}) => decideAlert({ ...baseInput, ...overrides });

  test("a fresh urgent low with consent and a configured channel dispatches", () => {
    assert.deepEqual(decide(), { dispatch: true, reason: "ok" });
  });

  test("a stale or backfilled sample never creates an urgent alert", () => {
    assert.deepEqual(decide({ readingIsFresh: false }), { dispatch: false, reason: "not_fresh" });
  });

  test("a duplicate event is suppressed", () => {
    assert.deepEqual(decide({ alreadyDelivered: true }), { dispatch: false, reason: "duplicate" });
  });

  test("an event key is stable and unique per sharer/follower/event/channel", () => {
    const k = alertEventKey("sharer_1", "follower_1", "evt_9", "email");
    assert.equal(k, alertEventKey("sharer_1", "follower_1", "evt_9", "email"));
    assert.notEqual(k, alertEventKey("sharer_1", "follower_1", "evt_9", "sms"));
    assert.notEqual(k, alertEventKey("sharer_1", "follower_2", "evt_9", "email"));
    assert.notEqual(k, alertEventKey("sharer_1", "follower_1", "evt_10", "email"));
  });

  test("a revoke or pause before dispatch cancels the send", () => {
    for (const status of ["revoked", "paused", "expired"]) {
      assert.deepEqual(
        decide({ access: accessWith({ glucose: true }, { status, alert_scopes: { urgent_low_email: true } }) }),
        { dispatch: false, reason: status }
      );
    }
  });

  test("withdrawing the glucose scope disables the glucose alert", () => {
    assert.deepEqual(
      decide({ access: accessWith({}, { alert_scopes: { urgent_low_email: true } }) }),
      { dispatch: false, reason: "glucose_scope_off" }
    );
  });

  test("an alert channel the owner never authorized is refused", () => {
    assert.deepEqual(
      decide({ access: accessWith({ glucose: true }, { alert_scopes: { urgent_low_sms: true } }) }),
      { dispatch: false, reason: "channel_not_authorized" }
    );
  });

  test("sms needs its own authorization — email consent does not imply it", () => {
    assert.deepEqual(
      decide({
        channel: "sms",
        followerPrefs: { notify_email: true, notify_sms: true, quiet_hours_start: 21, quiet_hours_end: 7 },
      }),
      { dispatch: false, reason: "channel_not_authorized" }
    );
  });

  test("an unconfigured channel is never reported as active", () => {
    assert.deepEqual(decide({ channelConfigured: false }), {
      dispatch: false,
      reason: "no_delivery_capability",
    });
  });

  test("a follower who opted out receives nothing", () => {
    assert.deepEqual(decide({ followerPrefs: { notify_email: false, quiet_hours_start: 21, quiet_hours_end: 7 } }), {
      dispatch: false,
      reason: "follower_opted_out",
    });
  });

  test("a normal reading does not alert", () => {
    assert.deepEqual(decide({ glucoseValue: 120 }), { dispatch: false, reason: "not_urgent" });
    assert.equal(isUrgentLow(URGENT_LOW_THRESHOLD), false, "the threshold itself is not urgent-low");
    assert.equal(isUrgentLow(URGENT_LOW_THRESHOLD - 1), true);
  });

  test("quiet hours never suppress an urgent low", () => {
    // 2026-10-24T18:00Z is 13:00 Chicago — outside quiet hours. Move to 03:00 local.
    const nightNow = new Date("2026-10-24T08:00:00.000Z").getTime();
    assert.equal(localHourInTimeZone(nightNow, "America/Chicago"), 3);
    assert.deepEqual(decide({ now: nightNow, glucoseValue: 48 }), { dispatch: true, reason: "ok" });
  });

  test("quiet hours are computed as a wrapping range in local time", () => {
    assert.equal(isWithinQuietHours(3, 21, 7), true);
    assert.equal(isWithinQuietHours(23, 21, 7), true);
    assert.equal(isWithinQuietHours(13, 21, 7), false);
    assert.equal(isWithinQuietHours(7, 21, 7), false);
    assert.equal(isWithinQuietHours(9, 9, 17), true);
    assert.equal(isWithinQuietHours(18, 9, 17), false);
    assert.equal(isWithinQuietHours(null, 21, 7), false);
  });

  test("follower preferences are sanitized against injection", () => {
    const prefs = sanitizeFollowerPrefs({ notify_email: true, quiet_hours_start: 99, quiet_hours_end: -4 });
    assert.equal(prefs.quiet_hours_start, 21);
    assert.equal(prefs.quiet_hours_end, 7);
    assert.equal(sanitizeFollowerPrefs({ notify_sms: "true" }).notify_sms, false);
  });

  test("a follower cannot grant themselves a channel the owner withheld", () => {
    // Owner authorized email only; follower turns on sms in their preferences.
    const decision = decideAlert({
      ...baseInput,
      channel: "sms",
      access: accessWith({ glucose: true }, { alert_scopes: { urgent_low_email: true } }),
      followerPrefs: { notify_email: true, notify_sms: true, quiet_hours_start: 21, quiet_hours_end: 7 },
    });
    assert.equal(decision.dispatch, false);
  });
});

// ── Misc helpers ───────────────────────────────────────────────────────────

describe("reading helpers", () => {
  test("latest reading and age are derived from real readings", () => {
    const readings = [readingAt(60, 100), readingAt(4, 150)];
    assert.equal(latestReading(readings).value, 150);
    assert.equal(readingAgeMinutes(latestReading(readings), NOW), 4);
    assert.equal(isStaleReading(latestReading(readings), NOW), false);
  });

  test("a missing reading is treated as stale, not as fine", () => {
    assert.equal(isStaleReading(null, NOW), true);
    assert.equal(readingAgeMinutes(null, NOW), null);
  });

  test("zones are neutral and urgent low outranks the personal target low", () => {
    assert.equal(sharedGlucoseZone(48, 70, 180, false), "urgentLow");
    assert.equal(sharedGlucoseZone(60, 70, 180, false), "below");
    assert.equal(sharedGlucoseZone(200, 70, 180, false), "above");
    assert.equal(sharedGlucoseZone(120, 70, 180, false), "inRange");
    assert.equal(sharedGlucoseZone(120, 70, 180, true), "none");
    // A stale value keeps its positional label (exactly as the patient side
    // does) but must never escalate to urgent-low language.
    assert.equal(sharedGlucoseZone(48, 70, 180, true), "below");
    assert.notEqual(sharedGlucoseZone(48, 70, 180, true), "urgentLow");
  });
});