// Automated tests for the follower-side presentation helpers.
//
// Run with:
//   node --test --experimental-strip-types base44/shared/__tests__/ src/lib/sharing/__tests__/
//
// Fabricated fixtures only. No network, database, messages or health records.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { describeActiveInsulinEstimate, describeActiveInsulinLabel } from "../insulinEstimateGate.js";
import { computeSharedDailyBalance } from "../sharedDailyBalance.js";

describe("active insulin estimate gating (never a misleading zero)", () => {
  test("a value is reported only when the plan is confirmed and doses exist", () => {
    const r = describeActiveInsulinEstimate(2.4, true, 2);
    assert.equal(r.available, true);
    assert.equal(r.value, 2.4);
    assert.equal(r.isZero, false);
    assert.equal(describeActiveInsulinLabel(r), "2.4 u");
  });

  test("an unconfirmed plan reports Unavailable, never 0.0u", () => {
    const r = describeActiveInsulinEstimate(0, false, 3);
    assert.equal(r.available, false);
    assert.equal(r.reason, "unconfirmed_plan");
    assert.equal(r.value, null);
    assert.equal(describeActiveInsulinLabel(r), "Unavailable");
  });

  test("no rapid-acting doses reports Unavailable rather than 0.0u", () => {
    const r = describeActiveInsulinEstimate(0, true, 0);
    assert.equal(r.available, false);
    assert.equal(r.reason, "no_rapid_doses");
    assert.equal(describeActiveInsulinLabel(r), "Unavailable");
  });

  test("a non-computable estimate reports Unavailable", () => {
    assert.equal(describeActiveInsulinEstimate(NaN, true, 2).reason, "not_computable");
    assert.equal(describeActiveInsulinEstimate(undefined, true, 2).reason, "not_computable");
    assert.equal(describeActiveInsulinEstimate(-1, true, 2).reason, "not_computable");
    assert.equal(describeActiveInsulinLabel(describeActiveInsulinEstimate(NaN, true, 2)), "Unavailable");
  });

  test("a genuinely decayed estimate from real doses reads 'None active', not 0.0u", () => {
    const r = describeActiveInsulinEstimate(0.01, true, 1);
    assert.equal(r.available, true);
    assert.equal(r.isZero, true);
    assert.equal(describeActiveInsulinLabel(r), "None active");
  });

  test("the estimate is rounded to a tenth of a unit", () => {
    assert.equal(describeActiveInsulinEstimate(2.4499, true, 1).value, 2.4);
    assert.equal(describeActiveInsulinEstimate(2.4501, true, 1).value, 2.5);
  });
});

// ── Daily balance parity ───────────────────────────────────────────────────

const CHICAGO_TODAY_START = "2026-10-24T05:00:00.000Z"; // sharer-local midnight, America/Chicago

function reading(iso, value, source = "dexcom") {
  return { id: `${iso}-${value}`, value, recorded_at: iso, source };
}

describe("shared daily balance reuses the patient calculation", () => {
  test("percentage is the same count-based rule the patient dashboard uses", () => {
    const readings = [
      reading("2026-10-24T06:00:00.000Z", 100),
      reading("2026-10-24T07:00:00.000Z", 120),
      reading("2026-10-24T08:00:00.000Z", 200),
      reading("2026-10-24T09:00:00.000Z", 60),
    ];
    const result = computeSharedDailyBalance(readings, 70, 180, CHICAGO_TODAY_START);
    assert.equal(result.percent, 50); // 2 of 4 in range
    assert.equal(result.readingCount, 4);
    assert.equal(result.label, "Mixed day");
  });

  test("the tier labels match the existing four tiers", () => {
    const at = (pct) => {
      const total = 20;
      const inRange = Math.round((pct / 100) * total);
      const dayStart = Date.UTC(2026, 9, 24, 6, 0, 0);
      const arr = [];
      for (let i = 0; i < total; i++) {
        arr.push(
          reading(new Date(dayStart + i * 30 * 60 * 1000).toISOString(), i < inRange ? 120 : 300)
        );
      }
      return computeSharedDailyBalance(arr, 70, 180, CHICAGO_TODAY_START).label;
    };
    assert.equal(at(90), "Balanced day");
    assert.equal(at(80), "Mostly steady");
    assert.equal(at(60), "Mixed day");
    assert.equal(at(40), "Off-balance day");
  });

  test("the day boundary follows the sharer, not the follower", () => {
    const readings = [
      // 04:00 UTC is still the PREVIOUS sharer-local day in Chicago (23:00).
      reading("2026-10-24T04:00:00.000Z", 300),
      // 06:00 UTC is 01:00 sharer-local — inside the sharer's today.
      reading("2026-10-24T06:00:00.000Z", 120),
    ];
    const result = computeSharedDailyBalance(readings, 70, 180, CHICAGO_TODAY_START);
    assert.equal(result.readingCount, 1, "only the reading inside the sharer's day counts");
    assert.equal(result.percent, 100);
  });

  test("carry-forward system readings are excluded, exactly as on the patient side", () => {
    const readings = [
      reading("2026-10-24T06:00:00.000Z", 120),
      reading("2026-10-24T07:00:00.000Z", 300, "system"),
    ];
    assert.equal(computeSharedDailyBalance(readings, 70, 180, CHICAGO_TODAY_START).percent, 100);
  });

  test("missing data returns null rather than an invented zero", () => {
    assert.equal(computeSharedDailyBalance([], 70, 180, CHICAGO_TODAY_START), null);
    assert.equal(computeSharedDailyBalance(null, 70, 180, CHICAGO_TODAY_START), null);
    assert.equal(
      computeSharedDailyBalance([reading("2026-10-24T04:00:00.000Z", 120)], 70, 180, CHICAGO_TODAY_START),
      null
    );
  });

  test("unusable thresholds return null rather than a wrong number", () => {
    const readings = [reading("2026-10-24T06:00:00.000Z", 120)];
    assert.equal(computeSharedDailyBalance(readings, null, 180, CHICAGO_TODAY_START), null);
    assert.equal(computeSharedDailyBalance(readings, 180, 70, CHICAGO_TODAY_START), null);
    assert.equal(computeSharedDailyBalance(readings, 70, 180, "not-a-date"), null);
  });
});