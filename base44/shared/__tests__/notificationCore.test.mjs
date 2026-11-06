import test from "node:test";
import assert from "node:assert/strict";

import {
  ABOVE_RANGE_DURATION_CHOICES,
  MISSING_DELAY_CHOICES,
  assertSchedulerCaller,
  buildNotificationCopy,
  classifySample,
  decideMissingNotification,
  decideReadingNotification,
  effectiveFollowerCategories,
  formatGlucoseValue,
  isHeldByQuietHours,
  notificationEventKey,
  resolveTapAccess,
  sanitizeFollowerPreferences,
  sanitizePersonalPreferences,
  zonedHour,
} from "../notificationCore.ts";

// A fixed instant so every case is deterministic: 2026-06-01 12:00 UTC.
const NOW = Date.parse("2026-06-01T12:00:00.000Z");
const LOW = 70;
const HIGH = 180;

let seq = 0;
function row(minutesAgo, value, extra = {}) {
  seq += 1;
  return {
    id: `r${seq}`,
    value,
    recorded_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
    source: "dexcom",
    ...extra,
  };
}

function decide(rows, extra = {}) {
  return decideReadingNotification({
    rows,
    nowMs: NOW,
    targetLow: LOW,
    targetHigh: HIGH,
    aboveMinutes: 30,
    ...extra,
  });
}

// ── Thresholds and units ──────────────────────────────────────────────────

test("urgent low is strictly below the urgent threshold; the range ends are inclusive", () => {
  assert.equal(classifySample(55, LOW, HIGH), "below");
  assert.equal(classifySample(54.9, LOW, HIGH), "urgent");
  assert.equal(classifySample(70, LOW, HIGH), "inRange");
  assert.equal(classifySample(180, LOW, HIGH), "inRange");
  assert.equal(classifySample(181, LOW, HIGH), "above");
  assert.equal(classifySample(69.9, LOW, HIGH), "below");
});

test("display values follow the person's own units", () => {
  assert.equal(formatGlucoseValue(180, "mg/dL"), "180");
  assert.equal(formatGlucoseValue(180, "mmol/L"), "10.0");
  assert.equal(formatGlucoseValue(54.9, "mg/dL"), "55");
});

test("an exactly-55 reading is a below-range notice, not an urgent one", () => {
  const decision = decide([row(14, 65), row(9, 60), row(4, 55)]);
  assert.equal(decision.category, "below_range");
});

test("a reading of 54.9 escalates to urgent", () => {
  const decision = decide([row(14, 65), row(9, 60), row(4, 54.9)]);
  assert.equal(decision.category, "urgent_low");
});

// ── Freshness, synthetic data, duplicates, ordering ───────────────────────

test("a fresh reading produces a decision and a stale one does not", () => {
  assert.ok(decide([row(7, 60)]), "7 minutes old is still current");
  assert.equal(decide([row(9, 60)]), null, "9 minutes old is past the 8 minute gate");
});

test("carry-forward (system) readings never notify", () => {
  assert.equal(decide([row(3, 45, { source: "system" })]), null);
});

test("a future-dated reading is ignored rather than treated as news", () => {
  const rows = [row(10, 100), { id: "future", value: 40, recorded_at: new Date(NOW + 10 * 60_000).toISOString(), source: "dexcom" }];
  assert.equal(decide(rows), null);
});

test("a duplicate measurement time is counted once", () => {
  const stamp = new Date(NOW - 3 * 60_000).toISOString();
  const rows = [
    { id: "a", value: 190, recorded_at: stamp, source: "dexcom" },
    { id: "b", value: 190, recorded_at: stamp, source: "dexcom" },
  ];
  const decision = decide(rows, { aboveMinutes: 15 });
  // One sample can never be a sustained high, however many duplicates exist.
  assert.equal(decision, null);
});

test("out-of-order input is ordered by measurement time, and the newest decides", () => {
  const rows = [row(4, 100), row(60, 300), row(2, 60)];
  const decision = decide(rows);
  assert.equal(decision.category, "below_range");
  assert.equal(decision.sample.value, 60);
});

// ── Sustained high ────────────────────────────────────────────────────────

test("a sustained high needs the chosen duration and real spaced samples", () => {
  const justUnder = decide([row(25, 200), row(20, 205), row(15, 210), row(10, 215), row(5, 210)], { aboveMinutes: 30 });
  assert.equal(justUnder, null, "20 minutes of data is not a 30 minute high");

  const sustained = decide(
    [row(35, 200), row(20, 205), row(10, 210), row(5, 205)],
    { aboveMinutes: 30 }
  );
  assert.equal(sustained.category, "above_range");
  assert.equal(sustained.durationMinutes, 30);
});

test("a gap breaks a high run: sustained is never inferred across missing intervals", () => {
  const rows = [row(45, 200), row(40, 205), row(5, 210)];
  assert.equal(decide(rows, { aboveMinutes: 30 }), null);
});

test("no duration chosen means no sustained-high notice", () => {
  const rows = [row(30, 200), row(25, 205), row(20, 210), row(5, 210)];
  assert.equal(decide(rows, { aboveMinutes: null }), null);
});

// ── One low episode, one escalation ───────────────────────────────────────

// Stable ids: one reading keeps one identity across evaluations, which is what
// makes an episode key stable in the real system.
const fixed = (id, minutesAgo, value, extra = {}) => ({
  id,
  value,
  recorded_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
  source: "dexcom",
  ...extra,
});

test("low, then urgent, then back to below: one escalation and no lower message after it", () => {
  const early = fixed("read-early", 8, 65);
  const middle = fixed("read-middle", 5, 64);
  const dip = fixed("read-dip", 3, 52);
  const rebound = fixed("read-rebound", 1, 62);

  const below = decide([early, middle]);
  const urgent = decide([early, middle, dip]);
  const afterUrgent = decide([early, middle, dip, rebound]);

  assert.equal(below.category, "below_range");
  assert.equal(urgent.category, "urgent_low");
  assert.equal(afterUrgent, null, "no below-range notice on de-escalation");
  assert.equal(urgent.episodeKey, below.episodeKey, "the same episode escalates rather than restarting");
});

test("a repeated urgent reading stays in the same episode", () => {
  const first = fixed("read-a", 6, 50);
  const second = fixed("read-b", 3, 48);
  const once = decide([first]);
  const twice = decide([first, second]);
  assert.equal(once.category, "urgent_low");
  assert.equal(twice.category, "urgent_low");
  assert.equal(once.episodeKey, twice.episodeKey);
});

test("one clearing reading does not re-arm; two consecutive clear readings do", () => {
  const low = fixed("read-low", 6, 60);
  const clearA = fixed("read-clear-a", 4, 120);
  const secondLow = fixed("read-low-2", 2, 62);

  const first = decide([low]);
  const afterOneClear = decide([low, clearA, secondLow]);

  const earlierLow = fixed("read-low-0", 10, 60);
  const clearB = fixed("read-clear-b", 8, 120);
  const clearC = fixed("read-clear-c", 5, 125);
  const afterTwoClears = decide([earlierLow, clearB, clearC, secondLow]);

  assert.equal(first.category, "below_range");
  assert.equal(afterOneClear.episodeKey, first.episodeKey, "one clear reading keeps the episode open");
  assert.notEqual(afterTwoClears.episodeKey, first.episodeKey, "two clears start a new episode");
});

test("the same shape holds for a high episode", () => {
  const ha = fixed("high-a", 10, 200);
  const hb = fixed("high-b", 7, 205);
  const hc = fixed("high-c", 5, 210);
  const clear = fixed("high-clear", 3, 100);
  const again = fixed("high-again", 1, 210);

  const first = decide([ha, hb, hc], { aboveMinutes: 5 });
  const afterOneClear = decide([ha, hb, hc, clear, again], { aboveMinutes: 5 });

  const clearTwo = fixed("high-clear-2", 2, 102);
  const freshHigh = fixed("high-fresh", 1, 212);
  const afterTwoClears = decide([ha, hb, hc, clear, clearTwo, freshHigh], { aboveMinutes: 5 });

  assert.equal(first.category, "above_range");
  assert.equal(afterOneClear.episodeKey, first.episodeKey, "one clear reading keeps the high episode open");
  assert.equal(afterTwoClears, null, "two clears start a new run, which is not sustained yet");
});

// ── Missing readings ──────────────────────────────────────────────────────

const connected = { status: "connected" };

function missing(rows, delayMinutes, connection = connected) {
  return decideMissingNotification({ rows, nowMs: NOW, delayMinutes, connection });
}

test("missing readings need an established connection and a real prior reading", () => {
  assert.ok(missing([row(25, 120)], 20));
  assert.equal(missing([row(25, 120)], 20, null), null, "no connection");
  assert.equal(missing([row(25, 120)], 20, { status: "error" }), null, "connection not connected");
  assert.equal(missing([row(25, 120)], 20, { status: "disconnected" }), null);
  assert.equal(missing([], 20), null, "brand-new account with no prior reading");
});

test("missing delay below the sync grace is refused", () => {
  assert.equal(missing([row(40, 120)], 10), null, "a 10 minute delay is not offered at all");
  assert.ok(missing([row(40, 120)], 15), "40 quiet minutes passes a 15 minute delay");
  assert.equal(missing([row(12, 120)], 15), null, "12 quiet minutes has not passed a 15 minute delay");
});

test("a long-standing gap is not announced hours later", () => {
  assert.equal(missing([row(240, 120)], 20), null);
});

test("each gap is its own episode", () => {
  const first = missing([row(30, 120)], 20);
  const afterNewReading = missing([row(30, 120), row(2, 118)], 20);
  assert.ok(first);
  assert.equal(afterNewReading, null, "the stream is back, so there is nothing to report");
});

// ── Privacy ───────────────────────────────────────────────────────────────

test("previews are generic unless health details are explicitly enabled", () => {
  const generic = buildNotificationCopy({ category: "urgent_low", value: 52, units: "mg/dL", readingAt: NOW, showDetails: false });
  assert.equal(generic.title, "Stackd update");
  assert.equal(generic.body, "Open Stackd for details.");
  assert.ok(!generic.body.includes("52"));

  const detailed = buildNotificationCopy({
    category: "urgent_low",
    value: 52,
    units: "mg/dL",
    readingAt: NOW - 3 * 60_000,
    timeZone: "UTC",
    showDetails: true,
  });
  assert.match(detailed.title, /urgent low/i);
  assert.match(detailed.body, /52 mg\/dL/);
  assert.match(detailed.body, /at \d/);
  assert.ok(!/right now|now!/i.test(detailed.body), "no freshness claim");
});

test("a follower preview never names the person unless details are on", () => {
  const generic = buildNotificationCopy({ category: "below_range", value: 62, units: "mg/dL", showDetails: false, personName: "Sam" });
  assert.ok(!generic.title.includes("Sam"));
  assert.ok(!generic.body.includes("Sam"));

  const detailed = buildNotificationCopy({
    category: "below_range",
    value: 62,
    units: "mg/dL",
    readingAt: NOW,
    timeZone: "UTC",
    showDetails: true,
    personName: "Sam",
  });
  assert.match(detailed.title, /^Sam: /);
});

test("the missing-readings wording states the receipt time and nothing more", () => {
  const copy = buildNotificationCopy({
    category: "missing_readings",
    readingAt: NOW - 40 * 60_000,
    timeZone: "UTC",
    showDetails: true,
  });
  assert.equal(copy.title, "Your readings haven’t updated");
  assert.match(copy.body, /^Your last reading was received at /);
});

// ── Quiet hours and daylight saving ───────────────────────────────────────

test("quiet hours wrap midnight and exempt only what was separately allowed", () => {
  const quiet = { enabled: true, startHour: 21, endHour: 7, timeZone: "UTC", urgentDuringQuiet: false };
  const at23 = Date.parse("2026-06-01T23:30:00.000Z");
  const at06 = Date.parse("2026-06-01T06:30:00.000Z");
  const at12 = Date.parse("2026-06-01T12:30:00.000Z");

  assert.equal(isHeldByQuietHours("below_range", quiet, at23), true);
  assert.equal(isHeldByQuietHours("below_range", quiet, at06), true);
  assert.equal(isHeldByQuietHours("below_range", quiet, at12), false);
  assert.equal(isHeldByQuietHours("urgent_low", quiet, at23), true);
  assert.equal(
    isHeldByQuietHours("urgent_low", { ...quiet, urgentDuringQuiet: true }, at23),
    false,
    "the separate urgent option lets urgent low through"
  );
  assert.equal(isHeldByQuietHours("urgent_low", { ...quiet, enabled: false }, at23), false);
});

test("quiet hours resolve in the recipient's zone, including across DST", () => {
  // 2026-03-08: clocks spring forward at 02:00 in New York.
  const beforeSpring = Date.parse("2026-03-08T06:30:00.000Z"); // 01:30 EST
  const afterSpring = Date.parse("2026-03-08T07:30:00.000Z"); // 03:30 EDT
  assert.equal(zonedHour(beforeSpring, "America/New_York"), 1);
  assert.equal(zonedHour(afterSpring, "America/New_York"), 3);

  // 2026-11-01: clocks fall back at 02:00 in New York.
  const firstPass = Date.parse("2026-11-01T05:30:00.000Z"); // 01:30 EDT
  const secondPass = Date.parse("2026-11-01T06:30:00.000Z"); // 01:30 EST
  assert.equal(zonedHour(firstPass, "America/New_York"), 1);
  assert.equal(zonedHour(secondPass, "America/New_York"), 1);

  const quiet = { enabled: true, startHour: 21, endHour: 7, timeZone: "America/New_York", urgentDuringQuiet: false };
  assert.equal(isHeldByQuietHours("above_range", quiet, beforeSpring), true);
  assert.equal(isHeldByQuietHours("above_range", quiet, afterSpring), true);
});

test("an unusable timezone never silently suppresses a notification", () => {
  const quiet = { enabled: true, startHour: 21, endHour: 7, timeZone: "Mars/Olympus", urgentDuringQuiet: false };
  // An unresolvable zone cannot place the person inside a window, so nothing is
  // held back on a guess.
  assert.equal(isHeldByQuietHours("urgent_low", quiet, Date.parse("2026-06-01T23:30:00.000Z")), false);
});

// ── Validation of saved settings ──────────────────────────────────────────

test("a sustained-high duration must come from the offered choices", () => {
  const missing = sanitizePersonalPreferences({ master_enabled: true, categories: { above_range: true } }, null);
  assert.equal(missing.error, "above_range_minutes_required");

  const bad = sanitizePersonalPreferences(
    { master_enabled: true, categories: { above_range: true }, above_range_minutes: 45 },
    null
  );
  assert.equal(bad.error, "invalid_above_range_minutes");

  const good = sanitizePersonalPreferences(
    { master_enabled: true, categories: { above_range: true }, above_range_minutes: ABOVE_RANGE_DURATION_CHOICES[1] },
    null
  );
  assert.equal(good.error, null);
  assert.equal(good.value.above_range_minutes, 30);
});

test("a missing-reading delay must be chosen explicitly, and above the sync grace", () => {
  const none = sanitizePersonalPreferences({ master_enabled: true, categories: { missing_readings: true } }, null);
  assert.equal(none.error, "missing_delay_minutes_required");

  const tooShort = sanitizePersonalPreferences(
    { master_enabled: true, categories: { missing_readings: true }, missing_delay_minutes: 5 },
    null
  );
  assert.equal(tooShort.error, "invalid_missing_delay_minutes");

  const good = sanitizePersonalPreferences(
    { master_enabled: true, categories: { missing_readings: true }, missing_delay_minutes: MISSING_DELAY_CHOICES[2] },
    null
  );
  assert.equal(good.error, null);
});

test("quiet hours need a window and a real IANA zone", () => {
  assert.equal(sanitizePersonalPreferences({ quiet_hours_enabled: true }, null).error, "quiet_hours_required");
  assert.equal(
    sanitizePersonalPreferences(
      { quiet_hours_enabled: true, quiet_start_hour: 21, quiet_end_hour: 7, quiet_timezone: "Not/AZone" },
      null
    ).error,
    "invalid_timezone"
  );
  const good = sanitizePersonalPreferences(
    { quiet_hours_enabled: true, quiet_start_hour: 21, quiet_end_hour: 7, quiet_timezone: "America/Chicago" },
    null
  );
  assert.equal(good.error, null);
  assert.equal(good.value.quiet_start_hour, 21);
  assert.equal(good.value.urgent_during_quiet, false, "urgent during quiet is separate and off by default");
});

test("everything starts off", () => {
  const { value } = sanitizePersonalPreferences({}, null);
  assert.equal(value.master_enabled, false);
  assert.deepEqual(value.categories, {
    urgent_low: false,
    below_range: false,
    above_range: false,
    missing_readings: false,
  });
  assert.equal(value.show_health_details, false);
});

// ── Two layers of permission ──────────────────────────────────────────────

const relationship = {
  status: "active",
  follower_user_id: "follower-1",
  scopes: { glucose: true },
  push: { urgent_low: true, below_range: false, above_range: false, missing_readings: false },
};

test("a follower can never widen what the sharer permitted", () => {
  const submitted = { urgent_low: true, below_range: true, above_range: true, missing_readings: true };
  assert.deepEqual(effectiveFollowerCategories(relationship, submitted), {
    urgent_low: true,
    below_range: false,
    above_range: false,
    missing_readings: false,
  });

  const { value } = sanitizeFollowerPreferences({ master_enabled: true, categories: submitted }, null, relationship);
  assert.deepEqual(value.categories, {
    urgent_low: true,
    below_range: false,
    above_range: false,
    missing_readings: false,
  });
});

test("a follower's missing category requires their own delay choice", () => {
  const granting = { ...relationship, push: { ...relationship.push, missing_readings: true } };
  const missingDelay = sanitizeFollowerPreferences(
    { master_enabled: true, categories: { missing_readings: true } },
    null,
    granting
  );
  assert.equal(missingDelay.error, "missing_delay_minutes_required");

  const good = sanitizeFollowerPreferences(
    { master_enabled: true, categories: { missing_readings: true }, missing_delay_minutes: 20 },
    null,
    granting
  );
  assert.equal(good.error, null);
  assert.equal(good.value.missing_delay_minutes, 20);
});

test("a revoked or glucose-less relationship is not pushable, and its link is refused", () => {
  assert.equal(resolveTapAccess("follower", { ...relationship, status: "revoked" }, NOW).allowed, false);
  assert.equal(resolveTapAccess("follower", { ...relationship, scopes: { glucose: false } }, NOW).allowed, false);
  assert.equal(resolveTapAccess("follower", relationship, NOW).destination, "/shared");
  assert.equal(resolveTapAccess("self", null, NOW).destination, "/");
});

// ── Scheduler authorization and keys ──────────────────────────────────────

test("only the platform's workflow run may evaluate", () => {
  assert.equal(assertSchedulerCaller(null).status, 401);
  assert.equal(assertSchedulerCaller({ id: "u1", role: "user" }).status, 403);
  assert.equal(assertSchedulerCaller({ id: "u1", role: "admin" }).status, 200);
});

test("event keys are deterministic and per recipient", () => {
  const a = notificationEventKey("urgent_low", "owner", "recipient-1", "low:r1");
  const b = notificationEventKey("urgent_low", "owner", "recipient-1", "low:r1");
  const c = notificationEventKey("urgent_low", "owner", "recipient-2", "low:r1");
  assert.equal(a, b);
  assert.notEqual(a, c);
});