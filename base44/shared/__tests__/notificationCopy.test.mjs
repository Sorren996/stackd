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
import { lowStreamDecisions as fixedLowDecisions } from '../notificationLowStream.ts';

// Pure-function tests only: no database, no push transport, no readings written
// anywhere and no saved settings touched.
const NOW = Date.parse("2026-11-06T12:00:00.000Z");
const fresh = (minutesAgo) => NOW - minutesAgo * 60_000;

const copy = (overrides = {}) =>
  buildNotificationCopy({ units: "mg/dL", timeZone: "UTC", showDetails: true, nowMs: NOW, ...overrides });

// ── Arrows: only ever the source's own verified trend ─────────────────────

test("each source trend maps to its own arrow, and none is invented", () => {
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
    assert.match(copy({ category: "urgent_low", value: 54, trend }).title, new RegExp(` 54 mg/dL ${arrow}$`));
  }
});

test("an absent, unrecognised or unusable trend adds no arrow at all", () => {
  for (const trend of [undefined, null, "", "None", "NotComputable", "RateOutOfRange", "Sideways", 42, {}]) {
    assert.equal(normalizeTrendWord(trend), null);
    assert.equal(trendArrowFor("urgent_low", trend), null);
    assert.equal(copy({ category: "urgent_low", value: 54, trend }).title, "Urgent low: 54 mg/dL");
  }
});

test("a pace alert never shows an arrow against its own direction", () => {
  assert.equal(trendArrowFor("falling_fast", "SingleUp"), null, "falling fast must not show a rise");
  assert.equal(trendArrowFor("falling_fast", "Flat"), null);
  assert.equal(trendArrowFor("falling_fast", "FortyFiveDown"), "↘");
  assert.equal(trendArrowFor("rising_fast", "SingleDown"), null, "rising fast must not show a fall");
  assert.equal(trendArrowFor("rising_fast", "DoubleUp"), "↑↑");
  assert.equal(copy({ category: "falling_fast", value: 145, trend: "SingleUp" }).title, "Falling fast: 145 mg/dL");
});

test("display units follow the recipient, with the reading converted, not restated", () => {
  assert.equal(copy({ category: "custom_high", value: 305, units: "mg/dL" }).title, "High glucose: 305 mg/dL");
  assert.equal(copy({ category: "custom_high", value: 305, units: "mmol/L" }).title, "High glucose: 16.9 mmol/L");
  assert.equal(copy({ category: "urgent_low", value: 54, units: "mmol/L", trend: "SingleDown" }).title, "Urgent low: 3.0 mmol/L ↓");
});

// ── One wording per category, never shared ────────────────────────────────

test("every category keeps its own distinct wording", () => {
  const seen = new Set();
  for (const category of ["urgent_low", "custom_low", "custom_high", "below_range", "above_range", "falling_fast", "rising_fast"]) {
    const result = copy({ category, value: 100 });
    assert.ok(!seen.has(result.title), `${category} reuses another headline`);
    seen.add(result.title);
  }
  // Thresholds are never conflated: a comfort-zone notice never claims an alert level.
  const comfort = ["below_range", "above_range"].map((category) => copy({ category, value: 100 }).body);
  for (const body of comfort) {
    assert.match(body, /comfort zone/);
    assert.doesNotMatch(body, /alert level/, "comfort-zone copy must not read as an alert threshold");
  }
  const alerts = ["custom_low", "custom_high"].map((category) => copy({ category, value: 100 }).body);
  for (const body of alerts) {
    assert.match(body, /alert level/);
    assert.doesNotMatch(body, /comfort zone/, "alert copy must not read as the comfort zone");
  }
});

test("a sustained high states the duration it actually held", () => {
  assert.equal(
    copy({ category: "above_range", value: 305, durationMinutes: 30 }).body,
    "Your glucose is above your comfort zone and has stayed there for 30 minutes."
  );
  assert.equal(copy({ category: "above_range", value: 305 }).body, "Your glucose is above your comfort zone.");
});

test("coalesced conditions are each named by their own threshold", () => {
  const both = copy({ category: "custom_high", value: 305, coveredCategories: ["custom_high", "above_range"] });
  assert.equal(both.title, "High glucose: 305 mg/dL");
  assert.match(both.body, /high alert level/);
  assert.match(both.body, /comfort-zone high/);

  const reversed = copy({ category: "above_range", value: 305, coveredCategories: ["above_range", "custom_high"] });
  assert.match(reversed.body, /comfort zone/);
  assert.match(reversed.body, /high alert level/);

  // A single condition never grows a second clause.
  const single = copy({ category: "custom_high", value: 305, coveredCategories: ["custom_high"] });
  assert.doesNotMatch(single.body, /also meets/);
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
  return fixedLowDecisions({ rows: rows(values), nowMs: NOW, preferences: { master_enabled: true, categories: allowedCategories, ...prefs }, thresholds: { low: 70 } }).at(-1) || result.notification;
}

test("threshold boundaries stay exactly where they are, and the copy follows", () => {
  // Urgent low is strictly below 55.
  assert.equal(classifySample(54.9, 70, 180), "urgent");
  assert.equal(classifySample(55, 70, 180), "below");
  assert.equal(decide({ urgent_low: true }, {}, [80, 80, 54]).category, "urgent_low");
  // Exactly 55 is not urgent. This account's low choice at 70 is the legacy
  // "below comfort zone" one, so that is the category the reading matched.
  assert.equal(decide({ below_range: true }, {}, [80, 80, 55]).category, "below_range");
  assert.equal(decide({ urgent_low: true }, {}, [80, 80, 55]), null, "55 is not an urgent low");

  // A custom high is inclusive at the level the person chose.
  assert.equal(decide({ custom_high: true }, { custom_high_mgdl: 180 }, [190, 185, 180]).category, "custom_high");
  assert.equal(decide({ custom_high: true }, { custom_high_mgdl: 180 }, [190, 185, 179]), null);

  // The comfort zone stays strict above its own high bound; its ends are inclusive.
  assert.equal(classifySample(181, 70, 180), "above");
  assert.equal(classifySample(180, 70, 180), "inRange");

  assert.equal(copy({ category: "urgent_low", value: 54, trend: "SingleDown" }).title, "Urgent low: 54 mg/dL ↓");
  assert.equal(copy({ category: "below_range", value: 55, trend: "Flat" }).title, "Below comfort zone: 55 mg/dL →");
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

  // Age is measured, not assumed: an unknown clock is simply omitted.
  const unknown = copy({ category: "missing_readings", readingAt: null, nowMs: NOW });
  assert.doesNotMatch(unknown.body, /minute/);
  assert.equal(unknown.body, "Your last reading is the most recent one we have.");
});

// ── Private by default ────────────────────────────────────────────────────

test("a private preview carries no value, trend, name or condition", () => {
  for (const category of ["urgent_low", "below_range", "above_range", "custom_low", "custom_high", "falling_fast", "rising_fast", "missing_readings"]) {
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
  // The one thing a private preview may say is that it is urgent.
  assert.equal(copy({ category: "urgent_low", value: 54, showDetails: false }).title, "Urgent Stackd alert");
  assert.equal(copy({ category: "custom_high", value: 305, showDetails: false }).title, "Stackd update");
});

// ── Followers ─────────────────────────────────────────────────────────────

test("a follower notice names whose reading it is only when details are allowed", () => {
  const detailed = copy({ category: "urgent_low", value: 54, personName: "Maria" });
  assert.equal(detailed.title, "Maria · Urgent low: 54 mg/dL");
  assert.match(detailed.body, /^Maria's glucose is critically low/);

  const endsInS = copy({ category: "below_range", value: 62, personName: "Chris" });
  assert.equal(endsInS.title, "Chris · Below comfort zone: 62 mg/dL");
  assert.match(endsInS.body, /^Chris' glucose is below Chris' comfort zone\.$/);

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
  assert.equal(fromB.title, "Urgent low: 58 mg/dL");
});