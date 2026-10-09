// Tests for rescue carb (is_rescue_carb) handling in the projection engine
// and evaluation loop. Uses synthetic deterministic data — no real user data.
//
// Covers:
//   1. Rescue carbs appear separately in activeInputs/inputProvenance.
//   2. Rescue carbs are modeled with the rapid (fast-class) absorption profile.
//   3. Rescue carbs are NOT counted as meals (mealCount, overlapping_meals).
//   4. Rescue carb mid-window exclusion in evaluation (rescue_carb_in_window).
//   5. No regression to existing meal/dose/reading handling.

import { describe, it, expect } from "vitest";
import {
  normalizeInputs,
  projectGlucose,
  carbAppearanceRateGPerMin,
  resolveHorizonMin,
} from "../index";
import {
  evaluateProjection,
  aggregateMetrics,
  EVALUATION_VERSION,
} from "../evaluation";

const MINUTE_MS = 60 * 1000;

function reading(value, minutesAgo, source = "dexcom") {
  return {
    recorded_at: new Date(Date.now() - minutesAgo * MINUTE_MS).toISOString(),
    value,
    source,
  };
}

function meal(carbs, minutesAgo, overrides = {}) {
  return {
    consumed_at: new Date(Date.now() - minutesAgo * MINUTE_MS).toISOString(),
    carbs,
    food_name: "Test Meal",
    absorption_profile: "medium",
    ...overrides,
  };
}

function rescueCarb(carbs, minutesAgo, overrides = {}) {
  return {
    consumed_at: new Date(Date.now() - minutesAgo * MINUTE_MS).toISOString(),
    carbs,
    food_name: "Glucose Tabs",
    absorption_profile: "fast",
    is_rescue_carb: true,
    classification: "rescue_carbs",
    ...overrides,
  };
}

function dose(units, minutesAgo, insulinType = "NovoLog") {
  return {
    administered_at: new Date(Date.now() - minutesAgo * MINUTE_MS).toISOString(),
    units,
    insulin_type: insulinType,
  };
}

const settings = {
  insulin_sensitivity_mgdl_per_unit: 50,
  meal_insulin_units_per_5g: 2.5,
  target_range_low: 70,
  target_range_high: 180,
};

describe("Rescue carb — projection inputs", () => {
  it("records rescue carbs separately in activeInputs and inputProvenance", () => {
    const now = Date.now();
    const snap = normalizeInputs(
      [reading(85, 3), reading(82, 8), reading(80, 13)],
      [rescueCarb(15, 5)],
      [],
      settings,
      now
    );
    const result = projectGlucose(snap);

    expect(result.abstained).toBe(false);
    expect(result.activeInputs).not.toBeNull();
    expect(result.activeInputs.rescueCarbGrams).toBeGreaterThan(0);
    expect(result.activeInputs.rescueCarbCount).toBe(1);
    expect(result.activeInputs.rescueTiming).not.toBeNull();
    expect(result.activeInputs.mealCount).toBe(0);
    expect(result.inputProvenance.rescueCarbCount).toBe(1);
    expect(result.inputProvenance.mealCount).toBe(0);
  });

  it("folds rescue carb grams into totalActiveCarbGrams but tracks them separately", () => {
    const now = Date.now();
    const snap = normalizeInputs(
      [reading(100, 3), reading(98, 8), reading(96, 13)],
      [meal(45, 10), rescueCarb(15, 5)],
      [],
      settings,
      now
    );
    const result = projectGlucose(snap);

    expect(result.activeInputs.mealCount).toBe(1);
    expect(result.activeInputs.rescueCarbCount).toBe(1);
    expect(result.activeInputs.rescueCarbGrams).toBeGreaterThan(0);
    // totalActiveCarbGrams should be meal carbs + rescue carbs (both remaining)
    expect(result.activeInputs.totalActiveCarbGrams).toBeGreaterThanOrEqual(
      result.activeInputs.rescueCarbGrams
    );
  });

  it("does not count rescue carbs as overlapping meals", () => {
    const now = Date.now();
    const snap = normalizeInputs(
      [reading(100, 3), reading(98, 8), reading(96, 13)],
      [meal(45, 10), rescueCarb(15, 5)],
      [],
      settings,
      now
    );
    // 1 regular meal + 1 rescue carb → activeMealCount should be 1, not 2
    expect(snap.dataQuality.activeMealCount).toBe(1);
    expect(snap.dataQuality.activeRescueCarbCount).toBe(1);
    // overlapping_meals should NOT be triggered (only 1 regular meal)
    expect(snap.dataQuality.confounders).not.toContain("overlapping_meals");
    // active_rescue_carb confounder should be present
    expect(snap.dataQuality.confounders).toContain("active_rescue_carb");
  });

  it("classifies rescue carbs with the fast speed class regardless of macros", () => {
    // A rescue carb with high fat/protein macros would normally be "high_fat",
    // but because it's a rescue carb it should use the "fast" profile.
    const now = Date.now();
    const rescueWithFat = rescueCarb(15, 5, { fat_grams: 30, protein_grams: 25 });
    const snap = normalizeInputs(
      [reading(85, 3), reading(82, 8), reading(80, 13)],
      [rescueWithFat],
      [],
      settings,
      now
    );
    const result = projectGlucose(snap);

    // activeSpeedClasses should NOT include "high_fat" for the rescue carb
    // (rescue carbs use "fast" but are not included in activeSpeedClasses at all)
    expect(result.activeInputs.activeSpeedClasses).not.toContain("high_fat");
    expect(result.activeInputs.rescueCarbCount).toBe(1);
  });
});

describe("Rescue carb — trajectory math (rapid absorption)", () => {
  it("produces upward pressure on the trajectory when a rescue carb is on board", () => {
    const now = Date.now();
    // Baseline: no rescue carb, just a reading with slight downward momentum
    const baselineSnap = normalizeInputs(
      [reading(80, 3), reading(80, 8), reading(80, 13)],
      [],
      [],
      settings,
      now
    );
    const baselineResult = projectGlucose(baselineSnap);

    // With rescue carb: 15g fast-acting glucose
    const rescueSnap = normalizeInputs(
      [reading(80, 3), reading(80, 8), reading(80, 13)],
      [rescueCarb(15, 2)],
      [],
      settings,
      now
    );
    const rescueResult = projectGlucose(rescueSnap);

    // The rescue carb projection should show higher glucose than baseline
    // at the 15-30 min mark (fast-class peak is ~30 min)
    const baselineAt15 = baselineResult.trajectory.find((p) => p.min_offset === 15)?.value;
    const rescueAt15 = rescueResult.trajectory.find((p) => p.min_offset === 15)?.value;

    expect(rescueAt15).toBeDefined();
    expect(baselineAt15).toBeDefined();
    expect(rescueAt15).toBeGreaterThan(baselineAt15);
  });

  it("uses the fast-class absorption window (120 min) for rescue carbs", () => {
    const now = Date.now();
    // A rescue carb 130 min ago should NOT be active (window is 120 min)
    const snap = normalizeInputs(
      [reading(100, 3), reading(98, 8), reading(96, 13)],
      [rescueCarb(15, 130)],
      [],
      settings,
      now
    );
    expect(snap.dataQuality.activeRescueCarbCount).toBe(0);
    expect(snap.activeRescueCarbs.length).toBe(0);
  });

  it("rescue carb absorption rate peaks earlier than a mixed-class meal", () => {
    const now = Date.now();
    const rescueTime = new Date(rescueCarb(15, 0).consumed_at).getTime();
    const mixedMeal = meal(15, 0, { absorption_profile: "medium" });
    const mixedTime = new Date(mixedMeal.consumed_at).getTime();

    // The rescue carb should peak at the fast-class peak (~30 min)
    // The mixed meal should peak at the mixed-class peak (~60 min)
    let rescuePeakMin = 0;
    let rescuePeakRate = 0;
    let mixedPeakMin = 0;
    let mixedPeakRate = 0;

    for (let t = 1; t <= 120; t++) {
      const rRate = carbAppearanceRateGPerMin(rescueCarb(15, 0), rescueTime + t * MINUTE_MS, null);
      if (rRate > rescuePeakRate) {
        rescuePeakRate = rRate;
        rescuePeakMin = t;
      }
      const mRate = carbAppearanceRateGPerMin(mixedMeal, mixedTime + t * MINUTE_MS, null);
      if (mRate > mixedPeakRate) {
        mixedPeakRate = mRate;
        mixedPeakMin = t;
      }
    }

    // Rescue carb should peak earlier (fast: ~30 min) than mixed meal (~60 min)
    expect(rescuePeakMin).toBeLessThan(mixedPeakMin);
  });
});

describe("Rescue carb — horizon and uncertainty", () => {
  it("extends the horizon to 60 min when rescue carbs are the only active input", () => {
    const now = Date.now();
    const snap = normalizeInputs(
      [reading(80, 3), reading(80, 8), reading(80, 13)],
      [rescueCarb(15, 5)],
      [],
      settings,
      now
    );
    // With only rescue carbs (no meals, no doses), horizon should be 60
    expect(resolveHorizonMin(snap)).toBe(60);
  });

  it("adds active_rescue_carb confounder which widens uncertainty", () => {
    const now = Date.now();
    const baselineSnap = normalizeInputs(
      [reading(100, 3), reading(98, 8), reading(96, 13)],
      [],
      [],
      settings,
      now
    );
    const rescueSnap = normalizeInputs(
      [reading(100, 3), reading(98, 8), reading(96, 13)],
      [rescueCarb(15, 5)],
      [],
      settings,
      now
    );

    // Use a fixed 60-min horizon for both so the comparison is at the same offset.
    const baselineResult = projectGlucose(baselineSnap, { horizonMin: 60 });
    const rescueResult = projectGlucose(rescueSnap, { horizonMin: 60 });

    // At 15 min, the rescue carb projection should have a wider band
    // (the active_rescue_carb confounder adds 3 mg/dL * dqRamp to sigma)
    const baselineBand = baselineResult.trajectory.find((p) => p.min_offset === 15);
    const rescueBand = rescueResult.trajectory.find((p) => p.min_offset === 15);

    expect(baselineBand).toBeDefined();
    expect(rescueBand).toBeDefined();

    const baselineWidth = baselineBand.upper - baselineBand.lower;
    const rescueWidth = rescueBand.upper - rescueBand.lower;

    // Rescue carb should have a wider band (3 mg/dL * dqRamp at 15 min)
    expect(rescueWidth).toBeGreaterThan(baselineWidth);
  });
});

describe("Rescue carb — evaluation exclusion", () => {
  it("marks a forecast with rescue_carb_in_window confounder when rescue carb is mid-window", () => {
    const generatedAt = Date.now() - 60 * MINUTE_MS; // forecast generated 60 min ago
    const projection = {
      generated_at: generatedAt,
      model_version: "1.0.0-baseline",
      horizon_minutes: 60,
      trajectory: [
        { min_offset: 0, value: 100, lower: 100, upper: 100 },
        { min_offset: 15, value: 105, lower: 95, upper: 115 },
        { min_offset: 30, value: 110, lower: 95, upper: 125 },
        { min_offset: 60, value: 115, lower: 90, upper: 140 },
      ],
      abstained: false,
    };

    // Actual readings at 15, 30, 60 min after generation
    const readings = [
      { time: generatedAt + 15 * MINUTE_MS, value: 120 },
      { time: generatedAt + 30 * MINUTE_MS, value: 130 },
      { time: generatedAt + 60 * MINUTE_MS, value: 140 },
    ];

    // Rescue carb ingested 30 min after the forecast (mid-window)
    const rescueCarbTimes = [generatedAt + 30 * MINUTE_MS];

    const evalTime = generatedAt + 70 * MINUTE_MS; // 10 min after horizon + buffer
    const result = evaluateProjection(projection, readings, evalTime, rescueCarbTimes);

    expect(result.status).toBe("evaluated");
    expect(result.confounders).toContain("rescue_carb_in_window");
  });

  it("does NOT mark a forecast when the rescue carb was before the forecast", () => {
    const generatedAt = Date.now() - 60 * MINUTE_MS;
    const projection = {
      generated_at: generatedAt,
      model_version: "1.0.0-baseline",
      horizon_minutes: 60,
      trajectory: [
        { min_offset: 0, value: 100, lower: 100, upper: 100 },
        { min_offset: 15, value: 105, lower: 95, upper: 115 },
        { min_offset: 30, value: 110, lower: 95, upper: 125 },
        { min_offset: 60, value: 115, lower: 90, upper: 140 },
      ],
      abstained: false,
    };

    const readings = [
      { time: generatedAt + 15 * MINUTE_MS, value: 110 },
      { time: generatedAt + 30 * MINUTE_MS, value: 115 },
      { time: generatedAt + 60 * MINUTE_MS, value: 118 },
    ];

    // Rescue carb 10 min BEFORE the forecast — the forecast should have
    // included it as an input, so it's not a confounder.
    const rescueCarbTimes = [generatedAt - 10 * MINUTE_MS];

    const evalTime = generatedAt + 70 * MINUTE_MS;
    const result = evaluateProjection(projection, readings, evalTime, rescueCarbTimes);

    expect(result.status).toBe("evaluated");
    expect(result.confounders).not.toContain("rescue_carb_in_window");
  });

  it("excludes rescue_carb_in_window forecasts from aggregateMetrics (learning)", () => {
    const generatedAt = Date.now() - 70 * MINUTE_MS;

    // Two evaluated projections: one clean, one with rescue carb in window
    const cleanEval = {
      model_version: "1.0.0-baseline",
      evaluation: {
        status: "evaluated",
        confounders: [],
        mae: 10,
        bias: 5,
        coverage: null,
        horizons: [],
        valid_count: 3,
        excluded_count: 0,
        exclusions: [],
        evaluation_version: EVALUATION_VERSION,
        evaluated_at: Date.now(),
      },
    };

    const rescueConfoundedEval = {
      model_version: "1.0.0-baseline",
      evaluation: {
        status: "evaluated",
        confounders: ["rescue_carb_in_window"],
        mae: 25,
        bias: 20,
        coverage: null,
        horizons: [],
        valid_count: 3,
        excluded_count: 0,
        exclusions: [],
        evaluation_version: EVALUATION_VERSION,
        evaluated_at: Date.now(),
      },
    };

    const metrics = aggregateMetrics([cleanEval, rescueConfoundedEval]);

    // Only the clean projection should be counted (sampleCount = 1)
    expect(metrics.sampleCount).toBe(1);
    expect(metrics.mae).toBe(10);
    expect(metrics.bias).toBe(5);
  });
});

describe("Rescue carb — no regression to existing handling", () => {
  it("regular meals still work unchanged when no rescue carbs are present", () => {
    const now = Date.now();
    const snap = normalizeInputs(
      [reading(120, 5), reading(125, 10), reading(130, 15)],
      [meal(45, 20)],
      [dose(3, 10)],
      settings,
      now
    );

    expect(snap.dataQuality.activeMealCount).toBe(1);
    expect(snap.dataQuality.activeRescueCarbCount).toBe(0);
    expect(snap.activeRescueCarbs).toEqual([]);

    const result = projectGlucose(snap);
    expect(result.abstained).toBe(false);
    expect(result.activeInputs.mealCount).toBe(1);
    expect(result.activeInputs.rescueCarbCount).toBe(0);
    expect(result.activeInputs.rescueCarbGrams).toBe(0);
    expect(result.activeInputs.rescueTiming).toBeNull();
  });

  it("rescue carbs with classification only (no is_rescue_carb flag) are detected", () => {
    const now = Date.now();
    const rescueByClassOnly = {
      consumed_at: new Date(Date.now() - 5 * MINUTE_MS).toISOString(),
      carbs: 15,
      food_name: "Juice",
      classification: "rescue_carbs",
      // is_rescue_carb not set — only classification
    };
    const snap = normalizeInputs(
      [reading(65, 3), reading(62, 8), reading(60, 13)],
      [rescueByClassOnly],
      [],
      settings,
      now
    );

    expect(snap.dataQuality.activeRescueCarbCount).toBe(1);
    expect(snap.dataQuality.activeMealCount).toBe(0);
  });

  it("expired rescue carbs (outside 120-min window) are not active", () => {
    const now = Date.now();
    const snap = normalizeInputs(
      [reading(100, 3), reading(98, 8), reading(96, 13)],
      [rescueCarb(15, 200)], // 200 min ago — outside the 120-min fast window
      [],
      settings,
      now
    );

    expect(snap.dataQuality.activeRescueCarbCount).toBe(0);
    expect(snap.activeRescueCarbs).toEqual([]);
    expect(snap.dataQuality.confounders).not.toContain("active_rescue_carb");
  });
});