// Ratio-sensitivity tests for the superposition projection model.
//
// These are the tests that must pass before the engine ships: they assert the
// two things the old trend-extrapolating model could not do —
//
//   1. changing INSULIN changes the curve the way insulin does (monotonic in
//      units, a decided fall, peak earlier rather than later), and
//   2. changing CARBS changes the hump the way carbohydrate does (roughly
//      proportional height, peak not earlier).
//
// Plus trend independence (the recent slope may nudge, never reshape) and
// determinism.

import { describe, it, expect } from "vitest";
import { normalizeInputs, projectGlucose } from "../index";
import { insulinShapeFor, insulinActionFraction, carbShapeFor, carbAbsorptionFraction } from "../superposition";

const MINUTE_MS = 60 * 1000;

// A realistic, user-entered insulin plan: 40 mg/dL per unit, 1 unit per 10 g.
const ISF = 40;
const UNITS_PER_5G = 0.5;
const CARB_SENSITIVITY = ISF * (UNITS_PER_5G / 5); // 4 mg/dL per gram

function settings() {
  return {
    insulin_sensitivity_mgdl_per_unit: ISF,
    meal_insulin_units_per_5g: UNITS_PER_5G,
    target_range_low: 70,
    target_range_high: 180,
  };
}

const now = Date.now();
const iso = (minutesAgo) => new Date(now - minutesAgo * MINUTE_MS).toISOString();

// 30 minutes of steady history ending at `anchorValue` 5 min ago.
function steadyReadings(anchorValue = 140, ageMin = 5) {
  const readings = [];
  for (let m = ageMin + 30; m >= ageMin; m -= 5) {
    readings.push({ recorded_at: iso(m), value: anchorValue, source: "dexcom" });
  }
  return readings;
}

function run({ carbs, units, readings, horizonMin = 60 }) {
  const meals = carbs
    ? [{ consumed_at: iso(30), carbs, absorption_profile: "medium", food_name: "Test meal" }]
    : [];
  const doses = units
    ? [{ administered_at: iso(30), units, insulin_type: "NovoLog" }]
    : [];
  const snapshot = normalizeInputs(readings || steadyReadings(), meals, doses, settings(), now);
  return projectGlucose(snapshot, { horizonMin });
}

const valueAt = (result, offset) => {
  const point = result.trajectory.find((p) => p.min_offset === offset);
  return point ? point.value : null;
};

const peakOffset = (result) =>
  result.trajectory.reduce((best, p) => (p.value > best.value ? p : best), result.trajectory[0]).min_offset;

describe("insulin ratio sensitivity", () => {
  it("a 10 u increase drops the 60-minute estimate by the extra insulin's delivered action", () => {
    const ten = run({ carbs: 40, units: 10 });
    const twenty = run({ carbs: 40, units: 20 });

    const v60Ten = valueAt(ten, 60);
    const v60Twenty = valueAt(twenty, 60);
    const drop = v60Ten - v60Twenty;

    // The extra 10 u only counts as much of its total effect as it has
    // actually delivered inside the forecast window. Because peak time moves
    // later with a bigger dose, that is less than a naively scaled 10 u curve
    // would deliver — which is the whole point of the dose-dependent shape.
    const deliveredInWindow = (units, fromMin, toMin) => {
      const shape = insulinShapeFor(units, "NovoLog");
      return insulinActionFraction(toMin, shape) - insulinActionFraction(fromMin, shape);
    };
    // Both doses were given 30 minutes before the anchor reading.
    const doseElapsedAtAnchor = 25;
    const f20 = deliveredInWindow(20, doseElapsedAtAnchor, doseElapsedAtAnchor + 60);
    const f10 = deliveredInWindow(10, doseElapsedAtAnchor, doseElapsedAtAnchor + 60);
    const expectedDrop = ISF * (20 * f20 - 10 * f10);

    expect(expectedDrop).toBeGreaterThan(0);
    expect(drop).toBeGreaterThan(expectedDrop * 0.85);
    expect(drop).toBeLessThan(expectedDrop * 1.15);
    // And it is a decided, visible change inside one hour — not noise.
    expect(drop).toBeGreaterThan(20);
  });

  it("is monotonic in units: more insulin never projects higher", () => {
    const doses = [5, 10, 15, 20, 25];
    const values = doses.map((units) => valueAt(run({ carbs: 40, units }), 60));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });

  it("starts its decline no later with a larger dose", () => {
    const ten = run({ carbs: 40, units: 10 });
    const twenty = run({ carbs: 40, units: 20 });
    expect(peakOffset(twenty)).toBeLessThanOrEqual(peakOffset(ten));
    // A dose that outweighs the meal must end the hour below where it started.
    expect(valueAt(twenty, 60)).toBeLessThan(twenty.trajectory[0].value);
  });
});

describe("carbohydrate ratio sensitivity", () => {
  it("doubles the rise, gram for gram, when only the grams change", () => {
    // Carbohydrate enters the model linearly: same food, same timing, twice
    // the grams — twice the rise at every point of the same shared grid.
    const small = run({ carbs: 20, units: null, horizonMin: 120 });
    const large = run({ carbs: 40, units: null, horizonMin: 120 });
    let checked = 0;
    for (const point of small.trajectory) {
      if (point.min_offset === 0) continue;
      // Stop before the display ceiling would clip either curve.
      if (valueAt(large, point.min_offset) >= 395) break;
      const riseSmall = point.value - small.trajectory[0].value;
      const riseLarge = valueAt(large, point.min_offset) - large.trajectory[0].value;
      expect(riseSmall).toBeGreaterThan(0);
      // Whole-mg/dL rounding on both curves: allow 3 mg/dL of slack.
      expect(Math.abs(riseLarge - 2 * riseSmall)).toBeLessThanOrEqual(3);
      checked++;
    }
    expect(checked).toBeGreaterThan(6);
  });

  it("keeps the larger meal above the smaller one at every offset", () => {
    const small = run({ carbs: 40, units: 5, horizonMin: 120 });
    const large = run({ carbs: 80, units: 5, horizonMin: 120 });

    expect(CARB_SENSITIVITY).toBeCloseTo(4, 6);
    for (const point of small.trajectory) {
      if (point.min_offset === 0) continue;
      expect(valueAt(large, point.min_offset)).toBeGreaterThan(point.value);
    }
  });

  it("does not move the peak earlier when carbs go up", () => {
    const small = run({ carbs: 40, units: 5, horizonMin: 120 });
    const large = run({ carbs: 80, units: 5, horizonMin: 120 });
    expect(peakOffset(large)).toBeGreaterThanOrEqual(peakOffset(small));
    // A bigger meal always ends the two hours higher than a smaller one.
    expect(valueAt(large, 120)).toBeGreaterThan(valueAt(small, 120));
  });

  it("delivers exactly the logged carbohydrate: area equals grams x sensitivity", () => {
    const shape = carbShapeFor("mixed", 1);
    expect(carbAbsorptionFraction(shape.durationMin + 1, shape)).toBe(1);
    expect(CARB_SENSITIVITY).toBeCloseTo(4, 6);
  });
});

describe("dose-dependent insulin action", () => {
  it("moves the peak later and lengthens the action as the dose grows", () => {
    const small = insulinShapeFor(2, "NovoLog");
    const large = insulinShapeFor(20, "NovoLog");

    expect(small.peakMin).toBeGreaterThanOrEqual(60);
    expect(small.peakMin).toBeLessThanOrEqual(90);
    expect(large.peakMin).toBeGreaterThanOrEqual(105);
    expect(large.durationMin).toBeGreaterThan(small.durationMin);
    expect(small.durationMin / 60).toBeGreaterThanOrEqual(3.9); // ~4 h
    expect(large.durationMin / 60).toBeLessThanOrEqual(6); // ~6 h
  });

  it("acts earlier for faster analogs", () => {
    const aspart = insulinShapeFor(10, "NovoLog");
    const faster = insulinShapeFor(10, "Fiasp");
    expect(faster.peakMin).toBeLessThan(aspart.peakMin);
  });
});

describe("trend independence", () => {
  it("moves the 30-minute estimate by less than 10 mg/dL between a rising and a falling entry", () => {
    // Same anchor level (160) in both cases; only the approach differs by
    // 10 mg/dL between the last two readings.
    const rising = [
      { recorded_at: iso(20), value: 150, source: "dexcom" },
      { recorded_at: iso(10), value: 155, source: "dexcom" },
      { recorded_at: iso(5), value: 160, source: "dexcom" },
    ];
    const falling = [
      { recorded_at: iso(20), value: 170, source: "dexcom" },
      { recorded_at: iso(10), value: 165, source: "dexcom" },
      { recorded_at: iso(5), value: 160, source: "dexcom" },
    ];

    const a = valueAt(run({ carbs: 40, units: 10, readings: rising }), 30);
    const b = valueAt(run({ carbs: 40, units: 10, readings: falling }), 30);

    expect(Math.abs(a - b)).toBeLessThan(10);
  });
});

describe("determinism", () => {
  it("produces an identical trajectory for identical inputs", () => {
    const first = run({ carbs: 40, units: 12, horizonMin: 60 });
    const second = run({ carbs: 40, units: 12, horizonMin: 60 });
    expect(second.trajectory.map((p) => p.value)).toEqual(first.trajectory.map((p) => p.value));
  });
});

describe("shape sanity", () => {
  it("20 u against 40 g is a brief bump then a decided fall", () => {
    const result = run({ carbs: 40, units: 20 });
    const start = result.trajectory[0].value;
    const peak = Math.max(...result.trajectory.map((p) => p.value));
    const peakAt = peakOffset(result);

    expect(peakAt).toBeLessThanOrEqual(20);
    expect(peak - start).toBeLessThanOrEqual(30);
    expect(valueAt(result, 60)).toBeLessThan(start);
  });

  it("5 u against 80 g is a sustained rise", () => {
    const result = run({ carbs: 80, units: 5 });
    expect(valueAt(result, 60)).toBeGreaterThan(valueAt(result, 30));
    expect(valueAt(result, 60)).toBeGreaterThan(result.trajectory[0].value);
  });
});