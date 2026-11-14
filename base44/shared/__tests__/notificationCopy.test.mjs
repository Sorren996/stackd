import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNotificationCopy,
  classifySample,
  normalizeSamples,
  PRIVATE_URGENT_TITLE,
  GENERIC_TITLE,
  GENERIC_BODY,
} from "../notificationCore.ts";
import { normalizeTrendWord, trendArrowFor } from "../notificationTrend.ts";
import { advanceNotificationEpisodes } from "../notificationEpisodes.ts";
import { lowStreamDecisions as fixedLowDecisions } from "../notificationLowStream.ts";

// Pure-function tests only: no database, no push transport, no readings written
// anywhere and no saved settings touched.
const NOW = Date.parse("2026-11-06T12:00:00.000Z");
const fresh = (minutesAgo) => NOW - minutesAgo * 60_000;

const copy = (overrides = {}) =>
  buildNotificationCopy({
    units: "mg/dL",
    timeZone: "UTC",
    showDetails: true,
    nowMs: NOW,
    targetLow: 70,
    targetHigh: 180,
    ...overrides,
  });

// ── Arrows: only ever the source's own verified trend ─────────────────────

test("each source trend maps to its own arrow glyph in the shared '{value} {unit} {arrow}' title", () => {
  const cases = [
    ["DoubleUp", "↑↑"],
    ["SingleUp", "↑"],
    ["FortyFiveUp", "↗"],
    ["Flat", "→"],
    ["FortyFiveDown", "↘"],
    ["SingleDown", "↓"],
    ["DoubleDown", "↓↓"],
  ];
  for (const [trend, arrow] of cases) {
    assert.equal(trendArrowFor("urgent_low", trend), arrow, trend);
    assert.equal(copy({ category: "urgent_low", value: 54, trend }).title, `54 mg/dL ${arrow}`);
  }
});

test("an absent, unrecognised or unusable trend outputs '{value} {unit}' with no arrow", () => {
  for (const trend of [undefined, null, "", "None", "NotComputable", "RateOutOfRange", "Sideways", 42, {}]) {
    assert.equal(normalizeTrendWord(trend), null);
    assert.equal(trendArrowFor("urgent_low", trend), null);
    assert.equal(copy({ category: "urgent_low", value: 54, trend }).title, "54 mg/dL");
  }
});

test("display units follow the recipient, and the body carries the trend, never a threshold", () => {
  assert.equal(copy({ category: "custom_high", value: 305, units: "mg/dL" }).title, "305 mg/dL");
  assert.equal(copy({ category: "custom_high", value: 305, units: "mg/dL" }).body, "New reading");
  assert.equal(copy({ category: "custom_high", value: 305, units: "mmol/L" }).title, "16.9 mmol/L");
  assert.equal(copy({ category: "custom_high", value: 305, units: "mmol/L", trend: "Flat" }).body, "Holding steady");
  assert.equal(copy({ category: "urgent_low", value: 54, units: "mmol/L", trend: "SingleDown" }).title, "3.0 mmol/L ↓");
});

// ── Exact two-line layout per category ────────────────────────────────────

test("every category renders the requested exact two-line copy", () => {
  assert.deepEqual(copy({ category: "all_readings", value: 145, trend: "Flat" }), {
    title: "145 mg/dL →",
    body: "Holding steady",
  });
  assert.deepEqual(copy({ category: "all_readings", value: 145, trend: null }), {
    title: "145 mg/dL",
    body: "New reading",
  });
  assert.deepEqual(copy({ category: "urgent_low", value: 50, trend: "SingleDown" }), {
    title: "50 mg/dL ↓",
    body: "Urgent low, act now.",
  });
  assert.deepEqual(copy({ category: "low_glucose", value: 65, trend: "FortyFiveDown" }), {
    title: "65 mg/dL ↘",
    body: "Easing down",
  });
  assert.deepEqual(copy({ category: "custom_low", value: 95, trend: "FortyFiveDown" }), {
    title: "95 mg/dL ↘",
    body: "Easing down",
  });
  assert.deepEqual(copy({ category: "below_range", value: 65, thresholdMgdl: 70, trend: "Flat" }), {
    title: "65 mg/dL →",
    body: "Holding steady",
  });
  assert.deepEqual(copy({ category: "custom_high", value: 185, thresholdMgdl: 180, trend: "SingleUp" }), {
    title: "185 mg/dL ↑",
    body: "Climbing",
  });
  assert.deepEqual(copy({ category: "above_range", value: 305, durationMinutes: 30, trend: "FortyFiveUp" }), {
    title: "305 mg/dL ↗",
    body: "Drifting up",
  });
  assert.deepEqual(copy({ category: "falling_fast", value: 120, trend: "DoubleDown" }), {
    title: "120 mg/dL ↓↓",
    body: "Falling fast",
  });
  assert.deepEqual(copy({ category: "rising_fast", value: 165, trend: "DoubleUp" }), {
    title: "165 mg/dL ↑↑",
    body: "Climbing fast",
  });
});

// ── Exact boundaries through the real live engine ─────────────────────────

function rows(values, trend = "SingleDown") {
  return values.map((value, i) => ({
    id: `r${i}`,
    value,
    recorded_at: new Date(fresh(6 - i * 3)).toISOString(),
    source: "dexcom",
    trend,
  }));
}

function decide(allowedCategories, prefs, values) {
  const result = advanceNotificationEpisodes({
    rows: rows(values),
    nowMs: NOW,
    preferences: { master_enabled: true, categories: allowedCategories, repeat_minutes: {}, ...prefs },
    thresholds: { low: 70, high: 180 },
    state: {},
  });
  return (
    fixedLowDecisions({
      rows: rows(values),
      nowMs: NOW,
      preferences: { master_enabled: true, categories: allowedCategories, ...prefs },
      thresholds: { low: 70 },
    }).at(-1) || result.notification
  );
}

test("threshold boundaries stay exactly where they are, and the copy follows", () => {
  assert.equal(classifySample(54.9, 70, 180), "urgent");
  assert.equal(classifySample(55, 70, 180), "below");
  assert.equal(decide({ urgent_low: true }, {}, [80, 80, 54]).category, "urgent_low");
  assert.equal(decide({ below_range: true }, {}, [80, 80, 55]).category, "below_range");
  assert.equal(decide({ urgent_low: true }, {}, [80, 80, 55]), null, "55 is not an urgent low");

  assert.equal(decide({ custom_high: true }, { custom_high_mgdl: 180 }, [190, 185, 180]).category, "custom_high");
  assert.equal(decide({ custom_high: true }, { custom_high_mgdl: 180 }, [190, 185, 179]), null);

  assert.equal(classifySample(181, 70, 180), "above");
  assert.equal(classifySample(180, 70, 180), "inRange");

  assert.equal(copy({ category: "urgent_low", value: 54, trend: "SingleDown" }).title, "54 mg/dL ↓");
  assert.equal(copy({ category: "below_range", value: 55, trend: "Flat" }).title, "55 mg/dL →");
});

// ── Missing readings: age, never a stale value ────────────────────────────

test("a missing-readings notice states the age and never a value or a trend", () => {
  const result = copy({
    category: "missing_readings",
    value: 140,
    trend: "SingleDown",
    readingAt: fresh(25),
  });
  assert.equal(result.title, "Readings haven't updated");
  assert.match(result.body, /^No new readings for 25 minutes\./);
  assert.match(result.body, /Your last reading arrived at /);
  assert.ok(!result.body.includes("140"), "a stale value is never presented");
  assert.ok(!/140|mg\/dL|↓|→/.test(`${result.title} ${result.body}`), "no value, unit or arrow");

  const unknown = copy({ category: "missing_readings", readingAt: null, nowMs: NOW });
  assert.doesNotMatch(unknown.body, /minute/);
  assert.equal(unknown.body, "Your last reading is the most recent one we have.");
});

// ── Private by default ────────────────────────────────────────────────────

test("a private preview carries no value, trend, name or condition", () => {
  for (const category of [
    "urgent_low",
    "below_range",
    "above_range",
    "custom_low",
    "custom_high",
    "falling_fast",
    "rising_fast",
    "missing_readings",
    "all_readings",
  ]) {
    const result = copy({
      category,
      value: 305,
      trend: "DoubleUp",
      readingAt: fresh(3),
      personName: "Private Name",
      showDetails: false,
    });
    const text = `${result.title} ${result.body}`;
    assert.doesNotMatch(text, /305|mg\/dL|↑|↓|Private Name/, category);
    assert.ok(!/comfort|alert level|urgent low/i.test(text), `${category} leaks the condition`);
    assert.ok([GENERIC_TITLE, PRIVATE_URGENT_TITLE].includes(result.title));
    assert.equal(result.body, GENERIC_BODY);
  }
  assert.equal(copy({ category: "urgent_low", value: 54, showDetails: false }).title, "Urgent Stackd alert");
  assert.equal(copy({ category: "custom_high", value: 305, showDetails: false }).title, "Stackd update");
});

// ── Followers ─────────────────────────────────────────────────────────────

test("a follower notice applies the shared two-line layout and names whose reading it is only when details are on", () => {
  const detailed = copy({ category: "urgent_low", value: 54, trend: "SingleDown", personName: "Maria" });
  assert.equal(detailed.title, "Maria · 54 mg/dL ↓");
  assert.equal(detailed.body, "Urgent low, act now.");

  const endsInS = copy({ category: "below_range", value: 62, trend: "Flat", personName: "Chris" });
  assert.equal(endsInS.title, "Chris · 62 mg/dL →");
  assert.equal(endsInS.body, "Holding steady");

  const customHighFollower = copy({
    category: "custom_high",
    value: 192,
    trend: "SingleUp",
    personName: "Maria",
  });
  assert.equal(customHighFollower.title, "Maria · 192 mg/dL ↑");
  assert.equal(customHighFollower.body, "Climbing");

  const priv = copy({ category: "urgent_low", value: 54, personName: "Maria", showDetails: false });
  assert.ok(!`${priv.title} ${priv.body}`.includes("Maria"));
});

// ── Triggering sample, not a later fetch ──────────────────────────────────

test("a trend belongs to its own measurement and is never inherited or invented", () => {
  const samples = normalizeSamples(
    [
      { id: "a", value: 60, recorded_at: new Date(fresh(6)).toISOString(), source: "dexcom", trend: "SingleDown" },
      { id: "b", value: 58, recorded_at: new Date(fresh(3)).toISOString(), source: "dexcom" },
      { id: "c", value: 57, recorded_at: new Date(fresh(1)).toISOString(), source: "manual", trend: "DoubleUp" },
    ],
    NOW
  );
  assert.equal(samples[0].trend, "singledown");
  assert.equal(samples[1].trend, null, "a reading without its own trend gets none");
  assert.equal(samples[2].trend, null, "a manual reading never carries a source trend");

  const fromB = copy({ category: "urgent_low", value: samples[1].value, trend: samples[1].trend });
  assert.equal(fromB.title, "58 mg/dL");
});