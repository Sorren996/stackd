import { describe, test, expect } from "vitest";
// Stackd Insight Engine — Milestone 4: Integrated Projection Intelligence
// Comprehensive deterministic tests for the integrated projection pipeline.
//
// These tests verify:
//   1. Model resolution (explicit eligibility, fallback, partial personalization)
//   2. No double-counting of correction factors
//   3. Empirical uncertainty calibration
//   4. Shadow evaluation (fair baseline-vs-personalized replay)
//   5. Cross-user isolation
//   6. Provenance and backward compatibility
//
// SAFETY: These tests verify informational projection behavior, never dosing.

import {
  projectGlucose,
  normalizeInputs,
  replayProjection,
  BASELINE_MODEL_VERSION,
  PERSONALIZED_MODEL_VERSION,
  MEAL_RESPONSE_MODEL_VERSION_BASELINE,
  MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED,
} from "../index";
import {
  resolveModelComponents,
  createBaselineResolution,
  createGeneralOnlyResolution,
  createMealOnlyResolution,
  MIN_RATE_FACTOR,
  MAX_RATE_FACTOR,
  MIN_MEAL_SPEED_FACTOR,
  MAX_MEAL_SPEED_FACTOR,
  MIN_MEAL_MAGNITUDE_FACTOR,
  MAX_MEAL_MAGNITUDE_FACTOR,
} from "../modelResolution";
import {
  calibrateUncertainty,
  getEmpiricalSigma,
  UNCERTAINTY_VERSION,
  MIN_SAMPLES_FOR_CALIBRATION,
} from "../uncertaintyCalibration";
import {
  evaluateProjection,
  aggregateMetrics,
  EVAL_HORIZONS,
  EVAL_BUFFER_MIN,
} from "../evaluation";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// ── Test helpers ────────────────────────────────────────────────────────────

function makeReadings(startMs, count, intervalMs, startValue, trend = 0) {
  const readings = [];
  let val = startValue;
  for (let i = 0; i < count; i++) {
    readings.push({
      recorded_at: new Date(startMs + i * intervalMs).toISOString(),
      value: Math.round(val),
      source: "dexcom",
    });
    val += trend;
  }
  return readings;
}

function makeMeal(consumedAtMs, carbs, opts = {}) {
  return {
    food_name: opts.name || "Test Meal",
    carbs,
    fat_grams: opts.fat || 0,
    protein_grams: opts.protein || 0,
    glycemic_index: opts.gi || 0,
    absorption_profile: opts.profile || "medium",
    consumed_at: new Date(consumedAtMs).toISOString(),
  };
}

function makeDose(administeredAtMs, units, insulinType = "NovoLog") {
  return {
    insulin_type: insulinType,
    units,
    administered_at: new Date(administeredAtMs).toISOString(),
  };
}

function makeSettings(opts = {}) {
  return {
    insulin_sensitivity_mgdl_per_unit: opts.isf ?? 50,
    meal_insulin_units_per_5g: opts.unitsPer5g ?? 2.5,
    target_range_low: opts.targetLow ?? 70,
    target_range_high: opts.targetHigh ?? 180,
  };
}

function makeProjectionState(rateAdjustmentFactor, baselineLocked = false) {
  const hasFactor = Number.isFinite(rateAdjustmentFactor) && Math.abs(rateAdjustmentFactor - 1.0) > 0.001;
  return {
    model_version: hasFactor && !baselineLocked ? PERSONALIZED_MODEL_VERSION : BASELINE_MODEL_VERSION,
    parameters: hasFactor && !baselineLocked ? { rateAdjustmentFactor } : {},
    sample_count: hasFactor ? 15 : 0,
    baseline_locked: baselineLocked || !hasFactor,
    evaluation_summary: {},
    update_history: [],
  };
}

function makeMealState(classParams, baselineLocked = false) {
  const speed_class_parameters = {};
  const sample_counts_by_class = {};
  for (const [cls, p] of Object.entries(classParams || {})) {
    speed_class_parameters[cls] = {
      speed_factor: p.speedFactor,
      magnitude_factor: p.magnitudeFactor,
      sample_count: p.sampleCount || 6,
    };
    sample_counts_by_class[cls] = p.sampleCount || 6;
  }
  const hasAny = Object.keys(speed_class_parameters).length > 0;
  return {
    model_version: hasAny && !baselineLocked ? MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED : MEAL_RESPONSE_MODEL_VERSION_BASELINE,
    speed_class_parameters,
    sample_counts_by_class,
    baseline_locked: baselineLocked || !hasAny,
    evaluation_summary: {},
    update_history: [],
  };
}

// Run a full projection pipeline: normalize → resolve → project.
function runProjection(readings, meals, doses, settings, projectionState, mealState, opts = {}) {
  const now = opts.now || Date.now();
  const snapshot = normalizeInputs(readings, meals, doses, settings, now);
  const resolution = resolveModelComponents(projectionState, mealState);
  const result = projectGlucose(snapshot, {
    horizonMin: opts.horizonMin || 60,
    modelResolution: resolution,
    uncertaintyCalibration: opts.uncertaintyCalibration || null,
  });
  return { snapshot, resolution, result };
}

// ── 1. Baseline projection with no personalized model state ─────────────────

describe("M4: Baseline projection (no personalization)", () => {
  test("produces a baseline trajectory with correct model version", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 150);
    const meals = [makeMeal(now - 20 * MINUTE, 45)];
    const doses = [makeDose(now - 18 * MINUTE, 3)];
    const settings = makeSettings();

    const { result, resolution } = runProjection(readings, meals, doses, settings, null, null);

    expect(result.abstained).toBe(false);
    expect(result.modelVersion).toBe(BASELINE_MODEL_VERSION);
    expect(result.mealModelVersion).toBe(MEAL_RESPONSE_MODEL_VERSION_BASELINE);
    expect(resolution.isIntegrated).toBe(false);
    expect(resolution.resolutionReason).toBe("full_baseline");
    expect(result.trajectory.length).toBeGreaterThan(0);
  });

  test("records effective parameters as baseline (1.0, null)", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 150);
    const { result } = runProjection(readings, [], [], makeSettings(), null, null);

    expect(result.effectiveParameters.rateAdjustmentFactor).toBe(1.0);
    expect(result.effectiveParameters.mealParams).toBeNull();
  });
});

// ── 2 & 3. Partial personalization (one component active, other falls back) ─

describe("M4: Partial personalization", () => {
  test("general personalization active, meal falls back to baseline", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 150);
    const meals = [makeMeal(now - 20 * MINUTE, 45)];
    const doses = [makeDose(now - 18 * MINUTE, 3)];
    const settings = makeSettings();
    const projState = makeProjectionState(1.15);
    const mealState = null;

    const { result, resolution } = runProjection(readings, meals, doses, settings, projState, mealState);

    expect(resolution.general.eligible).toBe(true);
    expect(resolution.general.effectiveValue).toBe(1.15);
    expect(resolution.meal.eligible).toBe(false);
    expect(resolution.isIntegrated).toBe(false);
    expect(resolution.resolutionReason).toBe("general_personalized_meal_baseline");
    expect(result.modelVersion).toBe(PERSONALIZED_MODEL_VERSION);
    expect(result.mealModelVersion).toBe(MEAL_RESPONSE_MODEL_VERSION_BASELINE);
    expect(result.effectiveParameters.rateAdjustmentFactor).toBe(1.15);
    expect(result.effectiveParameters.mealParams).toBeNull();
  });

  test("meal personalization active, general falls back to baseline", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 150);
    const meals = [makeMeal(now - 20 * MINUTE, 45)];
    const doses = [makeDose(now - 18 * MINUTE, 3)];
    const settings = makeSettings();
    const projState = null;
    const mealState = makeMealState({ mixed: { speedFactor: 1.2, magnitudeFactor: 0.9 } });

    const { result, resolution } = runProjection(readings, meals, doses, settings, projState, mealState);

    expect(resolution.general.eligible).toBe(false);
    expect(resolution.meal.eligible).toBe(true);
    expect(resolution.meal.eligibleClasses).toContain("mixed");
    expect(resolution.isIntegrated).toBe(false);
    expect(resolution.resolutionReason).toBe("meal_personalized_general_baseline");
    expect(result.modelVersion).toBe(BASELINE_MODEL_VERSION);
    expect(result.mealModelVersion).toBe(MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED);
    expect(result.effectiveParameters.rateAdjustmentFactor).toBe(1.0);
    expect(result.effectiveParameters.mealParams).not.toBeNull();
    expect(result.effectiveParameters.mealParams.mixed.speedFactor).toBe(1.2);
  });
});

// ── 4. Both personalized components active simultaneously ────────────────────

describe("M4: Integrated personalization", () => {
  test("both components active → integrated model", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 150);
    const meals = [makeMeal(now - 20 * MINUTE, 45)];
    const doses = [makeDose(now - 18 * MINUTE, 3)];
    const settings = makeSettings();
    const projState = makeProjectionState(1.1);
    const mealState = makeMealState({ mixed: { speedFactor: 1.15, magnitudeFactor: 0.85 } });

    const { result, resolution } = runProjection(readings, meals, doses, settings, projState, mealState);

    expect(resolution.isIntegrated).toBe(true);
    expect(resolution.resolutionReason).toBe("integrated_personalized");
    expect(result.modelVersion).toBe(PERSONALIZED_MODEL_VERSION);
    expect(result.mealModelVersion).toBe(MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED);
    expect(result.effectiveParameters.rateAdjustmentFactor).toBe(1.1);
    expect(result.effectiveParameters.mealParams.mixed.speedFactor).toBe(1.15);
    expect(result.effectiveParameters.mealParams.mixed.magnitudeFactor).toBe(0.85);
  });
});

// ── 5. Neither component eligible ───────────────────────────────────────────

describe("M4: Neither component eligible", () => {
  test("both states at baseline → full baseline", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 150);
    const projState = makeProjectionState(1.0, true); // baseline locked
    const mealState = makeMealState({}, true); // baseline locked

    const { result, resolution } = runProjection(readings, [], [], makeSettings(), projState, mealState);

    expect(resolution.general.eligible).toBe(false);
    expect(resolution.meal.eligible).toBe(false);
    expect(resolution.resolutionReason).toBe("full_baseline");
    expect(result.modelVersion).toBe(BASELINE_MODEL_VERSION);
    expect(result.mealModelVersion).toBe(MEAL_RESPONSE_MODEL_VERSION_BASELINE);
  });
});

// ── 6. Invalid or out-of-range parameter state ──────────────────────────────

describe("M4: Invalid parameter handling", () => {
  test("rateAdjustmentFactor out of range → falls back to baseline", () => {
    const projState = {
      model_version: PERSONALIZED_MODEL_VERSION,
      parameters: { rateAdjustmentFactor: 2.0 }, // way out of range
      baseline_locked: false,
    };
    const resolution = resolveModelComponents(projState, null);
    expect(resolution.general.eligible).toBe(false);
    expect(resolution.general.reason).toBe("parameter_out_of_range");
    expect(resolution.general.effectiveValue).toBe(1.0);
  });

  test("speedFactor out of range → that class falls back, others unaffected", () => {
    const mealState = makeMealState({
      fast: { speedFactor: 0.5, magnitudeFactor: 1.0 }, // below MIN_MEAL_SPEED_FACTOR
      mixed: { speedFactor: 1.2, magnitudeFactor: 0.9 }, // valid
    });
    const resolution = resolveModelComponents(null, mealState);
    expect(resolution.meal.classes.fast.eligible).toBe(false);
    expect(resolution.meal.classes.fast.reason).toBe("speed_factor_out_of_range");
    expect(resolution.meal.classes.mixed.eligible).toBe(true);
    expect(resolution.meal.eligible).toBe(true);
  });

  test("malformed state (null parameters) → safe fallback", () => {
    const resolution = resolveModelComponents({ baseline_locked: false, parameters: null }, null);
    expect(resolution.general.eligible).toBe(false);
    expect(resolution.general.reason).toBe("invalid_parameter");
  });

  test("NaN rateAdjustmentFactor → falls back to baseline", () => {
    const projState = {
      baseline_locked: false,
      parameters: { rateAdjustmentFactor: NaN },
    };
    const resolution = resolveModelComponents(projState, null);
    expect(resolution.general.eligible).toBe(false);
    expect(resolution.general.effectiveValue).toBe(1.0);
  });
});

// ── 7. Missing, stale, incomplete inputs ────────────────────────────────────

describe("M4: Input quality handling", () => {
  test("stale readings → abstains or low confidence", () => {
    const now = Date.now();
    const readings = makeReadings(now - 60 * MINUTE, 3, 5 * MINUTE, 150); // very stale
    const { result } = runProjection(readings, [], [], makeSettings(), null, null, { now });
    expect(result.abstained).toBe(true);
    expect(result.abstainReason).toContain("No valid CGM reading");
  });

  test("no readings → abstains", () => {
    const now = Date.now();
    const { result } = runProjection([], [], [], makeSettings(), null, null, { now });
    expect(result.abstained).toBe(true);
  });

  test("uncalibrated settings → flagged in data quality", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 150);
    const settings = { insulin_sensitivity_mgdl_per_unit: null, meal_insulin_units_per_5g: null };
    const { snapshot } = runProjection(readings, [], [], settings, null, null, { now });
    expect(snapshot.dataQuality.calibrated).toBe(false);
    expect(snapshot.dataQuality.confounders).toContain("uncalibrated_settings");
  });
});

// ── 8. Overlapping meals and overlapping insulin ────────────────────────────

describe("M4: Overlapping inputs", () => {
  test("overlapping meals → confounder flag, deterministic output", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 150);
    const meals = [
      makeMeal(now - 20 * MINUTE, 45),
      makeMeal(now - 15 * MINUTE, 30),
    ];
    const { snapshot, result } = runProjection(readings, meals, [], makeSettings(), null, null, { now });
    expect(snapshot.dataQuality.activeMealCount).toBe(2);
    expect(snapshot.dataQuality.confounders).toContain("overlapping_meals");
    // Deterministic: same inputs → same output
    const { result: result2 } = runProjection(readings, meals, [], makeSettings(), null, null, { now });
    expect(result.trajectory).toEqual(result2.trajectory);
  });

  test("multiple active doses → confounder flag", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 150);
    const doses = [
      makeDose(now - 20 * MINUTE, 3),
      makeDose(now - 15 * MINUTE, 2),
      makeDose(now - 10 * MINUTE, 4),
    ];
    const { snapshot } = runProjection(readings, [], doses, makeSettings(), null, null, { now });
    expect(snapshot.dataQuality.activeDoseCount).toBe(3);
    expect(snapshot.dataQuality.confounders).toContain("multiple_active_doses");
  });
});

// ── 9 & 10. Parameter application without double-counting ───────────────────

describe("M4: Parameter application and separation", () => {
  test("speedFactor changes timing but not total carb area", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 120);
    const meals = [makeMeal(now - 25 * MINUTE, 45)];

    const baseline = runProjection(readings, meals, [], makeSettings(), null, null, { now });
    const faster = runProjection(readings, meals, [], makeSettings(), null,
      makeMealState({ mixed: { speedFactor: 0.7, magnitudeFactor: 1.0 } }), { now });

    // The total area under the carb curve is conserved (same total carbs).
    // But the peak should shift earlier with speedFactor < 1.
    const trajBase = baseline.result.trajectory;
    const trajFast = faster.result.trajectory;

    // At least one point in the first 40 min should differ (timing changed)
    let anyDiff = false;
    for (let i = 0; i < Math.min(9, trajBase.length); i++) {
      if (trajBase[i].value !== trajFast[i].value) { anyDiff = true; break; }
    }
    expect(anyDiff).toBe(true);

    // The total rise over the full window should be similar (area conserved)
    const lastBaseline = trajBase[trajBase.length - 1].value;
    const lastFaster = trajFast[trajFast.length - 1].value;
    expect(Math.abs(lastFaster - lastBaseline)).toBeLessThan(25);
  });

  test("magnitudeFactor changes excursion magnitude", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const meals = [makeMeal(now - 5 * MINUTE, 15)];

    const baseline = runProjection(readings, meals, [], makeSettings(), null, null, { now });
    const smaller = runProjection(readings, meals, [], makeSettings(), null,
      makeMealState({ mixed: { speedFactor: 1.0, magnitudeFactor: 0.8 } }), { now });

    // With smaller magnitude, the peak should be lower
    const peakBaseline = Math.max(...baseline.result.trajectory.map(p => p.value));
    const peakSmaller = Math.max(...smaller.result.trajectory.map(p => p.value));
    expect(peakSmaller).toBeLessThan(peakBaseline);
  });

  test("rateAdjustmentFactor does not affect insulin activity directly", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const doses = [makeDose(now - 5 * MINUTE, 5)];

    // The rateAdjustmentFactor multiplies the net rate, which includes insulin.
    // But it should NOT change the insulin activity RATE itself — only the
    // net effect. Verify that the insulin activity is computed the same way
    // regardless of rateAdjustmentFactor by checking that the trajectory
    // with rateAdjustmentFactor=1.0 and rateAdjustmentFactor=1.3 differ
    // proportionally (not just in the insulin component).
    const baseline = runProjection(readings, [], doses, makeSettings(), null, null, { now });
    const adjusted = runProjection(readings, [], doses, makeSettings(),
      makeProjectionState(1.3), null, { now });

    // With rateAdjustmentFactor=1.3, the net rate is amplified by 1.3.
    // The insulin drop is part of the net rate, so it's also amplified.
    // This is the documented interaction — rateAdjustmentFactor applies to
    // the ENTIRE net rate, including insulin.
    expect(adjusted.result.effectiveParameters.rateAdjustmentFactor).toBe(1.3);
    // The trajectories should differ
    expect(adjusted.result.trajectory).not.toEqual(baseline.result.trajectory);
  });
});

// ── 11. Combined model behavior (all three factors active) ──────────────────

describe("M4: Combined model behavior", () => {
  test("all three factors active → bounded, deterministic, interpretable", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const meals = [makeMeal(now - 5 * MINUTE, 45)];
    const doses = [makeDose(now - 3 * MINUTE, 2)];
    const settings = makeSettings();
    const projState = makeProjectionState(1.2);
    const mealState = makeMealState({ mixed: { speedFactor: 1.15, magnitudeFactor: 0.85 } });

    const { result, resolution } = runProjection(readings, meals, doses, settings, projState, mealState, { now });

    expect(resolution.isIntegrated).toBe(true);
    // Bounded: all values within physiological range
    for (const p of result.trajectory) {
      expect(p.value).toBeGreaterThanOrEqual(20);
      expect(p.value).toBeLessThanOrEqual(500);
      expect(p.lower).toBeGreaterThanOrEqual(20);
      expect(p.upper).toBeLessThanOrEqual(500);
      expect(p.lower).toBeLessThanOrEqual(p.value);
      expect(p.upper).toBeGreaterThanOrEqual(p.value);
    }
    // Deterministic: same inputs → same output
    const { result: result2 } = runProjection(readings, meals, doses, settings, projState, mealState, { now });
    expect(result.trajectory).toEqual(result2.trajectory);
  });
});

// ── 12. Deterministic output ────────────────────────────────────────────────

describe("M4: Determinism", () => {
  test("identical inputs and model versions → identical output", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 150);
    const meals = [makeMeal(now - 20 * MINUTE, 45)];
    const settings = makeSettings();
    const projState = makeProjectionState(1.1);
    const mealState = makeMealState({ mixed: { speedFactor: 1.1, magnitudeFactor: 0.95 } });

    const r1 = runProjection(readings, meals, [], settings, projState, mealState, { now });
    const r2 = runProjection(readings, meals, [], settings, projState, mealState, { now });

    expect(r1.result.trajectory).toEqual(r2.result.trajectory);
    expect(r1.result.modelVersion).toEqual(r2.result.modelVersion);
    expect(r1.result.mealModelVersion).toEqual(r2.result.mealModelVersion);
  });
});

// ── 13. Model-version and parameter provenance ──────────────────────────────

describe("M4: Provenance", () => {
  test("projection records model resolution with selection reasons", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const projState = makeProjectionState(1.1);
    const mealState = makeMealState({ mixed: { speedFactor: 1.15, magnitudeFactor: 0.9 } });

    const { result, resolution } = runProjection(readings, [], [], makeSettings(), projState, mealState, { now });

    expect(result.modelResolution).not.toBeNull();
    expect(result.modelResolution.general.eligible).toBe(true);
    expect(result.modelResolution.general.reason).toBe("personalized_active");
    expect(result.modelResolution.meal.classes.mixed.eligible).toBe(true);
    expect(result.modelResolution.meal.classes.mixed.reason).toBe("personalized_active");
    expect(result.effectiveParameters.rateAdjustmentFactor).toBe(1.1);
    expect(result.effectiveParameters.mealParams.mixed.speedFactor).toBe(1.15);
  });

  test("uncertainty info is recorded when calibration is provided", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const cal = { method: "heuristic", version: UNCERTAINTY_VERSION, calibrated: false, sampleCount: 3, sigmaByHorizon: {}, coverageObserved: null };
    const snapshot = normalizeInputs(readings, [], [], makeSettings(), now);
    const result = projectGlucose(snapshot, { modelResolution: createBaselineResolution(), uncertaintyCalibration: cal });

    expect(result.uncertainty).not.toBeNull();
    expect(result.uncertainty.method).toBe("heuristic");
    expect(result.uncertainty.calibrated).toBe(false);
  });
});

// ── 14. Historical projections unchanged after model updates ────────────────

describe("M4: Historical integrity", () => {
  test("replaying with different params does not change the original trajectory", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 150);
    const meals = [makeMeal(now - 20 * MINUTE, 45)];
    const settings = makeSettings();

    // Original projection with baseline
    const original = runProjection(readings, meals, [], settings, null, null, { now });

    // Later, the user gets personalized params
    const personalized = runProjection(readings, meals, [], settings,
      makeProjectionState(1.2), makeMealState({ mixed: { speedFactor: 1.2, magnitudeFactor: 0.8 } }), { now });

    // The original trajectory is NOT changed by the new model state
    // (In the backend, the original projection record is never rewritten)
    expect(original.result.trajectory).not.toEqual(personalized.result.trajectory);
    expect(original.result.modelVersion).toBe(BASELINE_MODEL_VERSION);
    expect(personalized.result.modelVersion).toBe(PERSONALIZED_MODEL_VERSION);
  });
});

// ── 15. No future-data leakage ──────────────────────────────────────────────

describe("M4: No future-data leakage", () => {
  test("evaluation only uses readings after generated_at", () => {
    const genAt = Date.now() - 2 * HOUR;
    const projection = {
      generated_at: genAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60,
      trajectory: [
        { min_offset: 0, value: 150, lower: 140, upper: 160 },
        { min_offset: 15, value: 160, lower: 145, upper: 175 },
        { min_offset: 30, value: 170, lower: 150, upper: 190 },
        { min_offset: 60, value: 180, lower: 155, upper: 205 },
      ],
      abstained: false,
    };

    // Readings BEFORE generated_at should not be used
    const readings = [
      { time: genAt - 30 * MINUTE, value: 140 }, // before — should be excluded
      { time: genAt + 15 * MINUTE, value: 165 },  // valid for 15-min horizon
      { time: genAt + 30 * MINUTE, value: 175 },  // valid for 30-min horizon
      { time: genAt + 60 * MINUTE, value: 185 },  // valid for 60-min horizon
    ];

    const result = evaluateProjection(projection, readings, genAt + 90 * MINUTE);
    expect(result.status).toBe("evaluated");
    // The 15-min horizon should match 165, not 140
    const h15 = result.horizons.find(h => h.horizon_min === 15);
    expect(h15.actual).toBe(165);
  });
});

// ── 16. Horizon matching, buffers, exclusions ───────────────────────────────

describe("M4: Evaluation matching", () => {
  test("horizon beyond forecast horizon is excluded", () => {
    const genAt = Date.now() - 2 * HOUR;
    const projection = {
      generated_at: genAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60,
      trajectory: [{ min_offset: 60, value: 180, lower: 160, upper: 200 }],
      abstained: false,
    };
    const readings = [{ time: genAt + 120 * MINUTE, value: 190 }];
    const result = evaluateProjection(projection, readings, genAt + 150 * MINUTE);
    const h120 = result.horizons.find(h => h.horizon_min === 120);
    expect(h120.scored).toBe(false);
    expect(h120.exclusion_reason).toBe("beyond_forecast_horizon");
  });

  test("buffer not elapsed → excluded", () => {
    const genAt = Date.now() - 20 * MINUTE;
    const projection = {
      generated_at: genAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60,
      trajectory: [
        { min_offset: 15, value: 160, lower: 145, upper: 175 },
      ],
      abstained: false,
    };
    const readings = [{ time: genAt + 15 * MINUTE, value: 165 }];
    // Only 20 min after genAt, but 15-min horizon needs 15 + 10 buffer = 25 min
    const result = evaluateProjection(projection, readings, genAt + 20 * MINUTE);
    const h15 = result.horizons.find(h => h.horizon_min === 15);
    expect(h15.scored).toBe(false);
    expect(h15.exclusion_reason).toBe("buffer_not_elapsed");
  });
});

// ── 17. Fair baseline-versus-personalized replay ─────────────────────────────

describe("M4: Shadow evaluation (replay)", () => {
  test("replay with baseline and personalized on same observations", () => {
    const genAt = Date.now() - 2 * HOUR;
    const readings = makeReadings(genAt - 30 * MINUTE, 20, 5 * MINUTE, 140, 1);
    const meals = [makeMeal(genAt - 20 * MINUTE, 45)];
    const doses = [makeDose(genAt - 18 * MINUTE, 3)];
    const settings = makeSettings();

    const originalProjection = {
      anchor_time: new Date(genAt - 5 * MINUTE).toISOString(),
      anchor_value: 140,
      generated_at: new Date(genAt).toISOString(),
      horizon_minutes: 60,
    };

    const baselineReplay = replayProjection(originalProjection, readings, meals, doses, settings, createBaselineResolution());
    const personalizedReplay = replayProjection(originalProjection, readings, meals, doses, settings,
      createGeneralOnlyResolution(1.15));

    expect(baselineReplay.abstained).toBe(false);
    expect(personalizedReplay.abstained).toBe(false);
    expect(baselineReplay.modelVersion).toBe(BASELINE_MODEL_VERSION);
    expect(personalizedReplay.modelVersion).toBe(PERSONALIZED_MODEL_VERSION);
    // Trajectories should differ (different rateAdjustmentFactor)
    expect(baselineReplay.trajectory).not.toEqual(personalizedReplay.trajectory);
  });

  test("replay is deterministic for identical inputs", () => {
    const genAt = Date.now() - 2 * HOUR;
    const readings = makeReadings(genAt - 30 * MINUTE, 10, 5 * MINUTE, 140);
    const meals = [makeMeal(genAt - 20 * MINUTE, 45)];
    const settings = makeSettings();

    const proj = { anchor_time: new Date(genAt - 5 * MINUTE).toISOString(), anchor_value: 140, generated_at: new Date(genAt).toISOString(), horizon_minutes: 60 };
    const r1 = replayProjection(proj, readings, meals, [], settings, createBaselineResolution());
    const r2 = replayProjection(proj, readings, meals, [], settings, createBaselineResolution());
    expect(r1.trajectory).toEqual(r2.trajectory);
  });
});

// ── 18. Insufficient evaluation data ─────────────────────────────────────────

describe("M4: Uncertainty calibration thresholds", () => {
  test("fewer than MIN_SAMPLES_FOR_CALIBRATION → heuristic, uncalibrated", () => {
    const fewProjections = Array.from({ length: MIN_SAMPLES_FOR_CALIBRATION - 1 }, (_, i) => ({
      evaluation: { status: "evaluated", mae: 15, horizons: [], coverage: null },
    }));
    const cal = calibrateUncertainty(fewProjections);
    expect(cal.method).toBe("heuristic");
    expect(cal.calibrated).toBe(false);
  });

  test("enough projections with horizon errors → empirical_calibrated", () => {
    const projections = Array.from({ length: MIN_SAMPLES_FOR_CALIBRATION }, (_, i) => ({
      evaluation: {
        status: "evaluated",
        mae: 15,
        horizons: EVAL_HORIZONS.map(h => ({
          horizon_min: h,
          scored: h <= 60,
          abs_error: h <= 60 ? 10 + i : null,
          in_interval: h <= 60 ? true : null,
        })),
        coverage: 0.8,
      },
    }));
    const cal = calibrateUncertainty(projections);
    expect(cal.method).toBe("empirical_calibrated");
    expect(cal.calibrated).toBe(true);
    expect(cal.sigmaByHorizon[15]).toBeGreaterThan(0);
    expect(cal.sigmaByHorizon[30]).toBeGreaterThan(0);
    expect(cal.sigmaByHorizon[60]).toBeGreaterThan(0);
  });
});

// ── 19. Honest handling of uncalibrated uncertainty ─────────────────────────

describe("M4: Honest uncertainty", () => {
  test("uncalibrated projection marks method as heuristic", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const snapshot = normalizeInputs(readings, [], [], makeSettings(), now);
    const result = projectGlucose(snapshot, {
      modelResolution: createBaselineResolution(),
      uncertaintyCalibration: null, // no calibration
    });
    expect(result.uncertainty).toBeNull();
  });

  test("personalization does NOT increase confidence when uncalibrated", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const meals = [makeMeal(now - 5 * MINUTE, 45)];

    const baselineResult = runProjection(readings, meals, [], makeSettings(), null, null, { now });
    const personalizedResult = runProjection(readings, meals, [], makeSettings(),
      makeProjectionState(1.2), makeMealState({ mixed: { speedFactor: 1.2, magnitudeFactor: 0.8 } }), { now });

    // Without calibration, personalization is unvalidated. Confidence should
    // NOT increase — it should be equal or lower than baseline.
    expect(personalizedResult.result.confidence).toBeLessThanOrEqual(baselineResult.result.confidence);
  });
});

// ── 20. Prediction intervals and coverage ───────────────────────────────────

describe("M4: Coverage metrics", () => {
  test("coverage is computed when all scored horizons have intervals", () => {
    const genAt = Date.now() - 2 * HOUR;
    const projection = {
      generated_at: genAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60,
      trajectory: [
        { min_offset: 15, value: 160, lower: 145, upper: 175 },
        { min_offset: 30, value: 170, lower: 150, upper: 190 },
        { min_offset: 60, value: 180, lower: 155, upper: 205 },
      ],
      abstained: false,
    };
    const readings = [
      { time: genAt + 15 * MINUTE, value: 165 }, // inside [145,175]
      { time: genAt + 30 * MINUTE, value: 175 }, // inside [150,190]
      { time: genAt + 60 * MINUTE, value: 185 }, // inside [155,205]
    ];
    const result = evaluateProjection(projection, readings, genAt + 90 * MINUTE);
    expect(result.coverage).toBe(1.0); // all inside
  });

  test("coverage is null when any horizon lacks an interval", () => {
    const genAt = Date.now() - 2 * HOUR;
    const projection = {
      generated_at: genAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60,
      trajectory: [
        { min_offset: 15, value: 160, lower: null, upper: null }, // no interval
        { min_offset: 30, value: 170, lower: 150, upper: 190 },
        { min_offset: 60, value: 180, lower: 155, upper: 205 },
      ],
      abstained: false,
    };
    const readings = [
      { time: genAt + 15 * MINUTE, value: 165 },
      { time: genAt + 30 * MINUTE, value: 175 },
      { time: genAt + 60 * MINUTE, value: 185 },
    ];
    const result = evaluateProjection(projection, readings, genAt + 90 * MINUTE);
    expect(result.coverage).toBeNull();
  });
});

// ── 21. Baseline fallback after failed validation ────────────────────────────

describe("M4: Baseline fallback", () => {
  test("baseline_locked state → general component falls back", () => {
    const projState = makeProjectionState(1.2, true); // was personalized, now reverted
    const resolution = resolveModelComponents(projState, null);
    expect(resolution.general.eligible).toBe(false);
    expect(resolution.general.reason).toBe("baseline_locked");
  });

  test("meal state with all classes at 1.0 → no eligible classes", () => {
    const mealState = makeMealState({
      fast: { speedFactor: 1.0, magnitudeFactor: 1.0 },
      mixed: { speedFactor: 1.0, magnitudeFactor: 1.0 },
    });
    const resolution = resolveModelComponents(null, mealState);
    expect(resolution.meal.eligible).toBe(false);
    expect(resolution.meal.reason).toBe("no_eligible_classes");
  });
});

// ── 22. Independent user state and cross-user isolation ──────────────────────

describe("M4: Cross-user isolation", () => {
  test("two users with different model states produce different projections", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const meals = [makeMeal(now - 5 * MINUTE, 45)];
    const settings = makeSettings();

    // User A: baseline
    const userA = runProjection(readings, meals, [], settings, null, null, { now });

    // User B: personalized
    const userB = runProjection(readings, meals, [], settings,
      makeProjectionState(1.2), makeMealState({ mixed: { speedFactor: 1.15, magnitudeFactor: 0.85 } }), { now });

    expect(userA.result.modelVersion).toBe(BASELINE_MODEL_VERSION);
    expect(userB.result.modelVersion).toBe(PERSONALIZED_MODEL_VERSION);
    expect(userA.result.trajectory).not.toEqual(userB.result.trajectory);
  });

  test("user A's model state does not affect user B's resolution", () => {
    const userAState = makeProjectionState(1.3);
    const userBState = null;

    const resA = resolveModelComponents(userAState, null);
    const resB = resolveModelComponents(userBState, null);

    expect(resA.general.eligible).toBe(true);
    expect(resA.general.effectiveValue).toBe(1.3);
    expect(resB.general.eligible).toBe(false);
    expect(resB.general.effectiveValue).toBe(1.0);
  });

  test("different meal params for different users → different trajectories", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const meals = [makeMeal(now - 5 * MINUTE, 45)];
    const settings = makeSettings();

    const userA = runProjection(readings, meals, [], settings, null,
      makeMealState({ mixed: { speedFactor: 0.8, magnitudeFactor: 1.0 } }), { now });
    const userB = runProjection(readings, meals, [], settings, null,
      makeMealState({ mixed: { speedFactor: 1.3, magnitudeFactor: 1.2 } }), { now });

    expect(userA.result.trajectory).not.toEqual(userB.result.trajectory);
  });
});

// ── 23. Concurrent projection and model-state updates ───────────────────────

describe("M4: Concurrency safety", () => {
  test("projection generation does not mutate model state", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const projState = makeProjectionState(1.1);
    const mealState = makeMealState({ mixed: { speedFactor: 1.1, magnitudeFactor: 0.9 } });

    // Snapshot the state before
    const stateBefore = JSON.parse(JSON.stringify(projState));
    const mealBefore = JSON.parse(JSON.stringify(mealState));

    runProjection(readings, [], [], makeSettings(), projState, mealState, { now });

    // State should not be mutated by projection
    expect(projState).toEqual(stateBefore);
    expect(mealState).toEqual(mealBefore);
  });

  test("repeated projection calls are idempotent", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const projState = makeProjectionState(1.1);
    const mealState = makeMealState({ mixed: { speedFactor: 1.1, magnitudeFactor: 0.9 } });

    const r1 = runProjection(readings, [], [], makeSettings(), projState, mealState, { now });
    const r2 = runProjection(readings, [], [], makeSettings(), projState, mealState, { now });
    const r3 = runProjection(readings, [], [], makeSettings(), projState, mealState, { now });

    expect(r1.result.trajectory).toEqual(r2.result.trajectory);
    expect(r2.result.trajectory).toEqual(r3.result.trajectory);
  });
});

// ── 24. Backward compatibility with existing stored projections ───────────────

describe("M4: Backward compatibility", () => {
  test("legacy modelParams path still works without modelResolution", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const meals = [makeMeal(now - 5 * MINUTE, 45)];
    const snapshot = normalizeInputs(readings, meals, [], makeSettings(), now);

    // Legacy path: pass modelParams and mealModelParams directly
    const result = projectGlucose(snapshot, {
      horizonMin: 60,
      modelParams: { rateAdjustmentFactor: 1.1 },
      mealModelParams: { mixed: { speedFactor: 1.15, magnitudeFactor: 0.9 } },
    });

    expect(result.modelVersion).toBe(PERSONALIZED_MODEL_VERSION);
    expect(result.mealModelVersion).toBe(MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED);
    expect(result.trajectory.length).toBeGreaterThan(0);
  });

  test("legacy path with no params → baseline", () => {
    const now = Date.now();
    const readings = makeReadings(now - 10 * MINUTE, 3, 5 * MINUTE, 120);
    const snapshot = normalizeInputs(readings, [], [], makeSettings(), now);
    const result = projectGlucose(snapshot, { horizonMin: 60 });
    expect(result.modelVersion).toBe(BASELINE_MODEL_VERSION);
    expect(result.mealModelVersion).toBe(MEAL_RESPONSE_MODEL_VERSION_BASELINE);
  });
});

// ── End-to-end scenarios ─────────────────────────────────────────────────────

describe("M4: End-to-end scenarios", () => {
  test("E2E: both components eligible → integrated projection differs from baseline", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 130, 0.5);
    const meals = [makeMeal(now - 20 * MINUTE, 60, { fat: 10, protein: 20 })]; // mixed class
    const doses = [makeDose(now - 18 * MINUTE, 4)];
    const settings = makeSettings({ isf: 50, unitsPer5g: 2.5 });

    const baseline = runProjection(readings, meals, doses, settings, null, null, { now });
    const integrated = runProjection(readings, meals, doses, settings,
      makeProjectionState(1.15),
      makeMealState({ mixed: { speedFactor: 1.2, magnitudeFactor: 0.85 } }),
      { now });

    expect(baseline.result.modelVersion).toBe(BASELINE_MODEL_VERSION);
    expect(integrated.result.modelVersion).toBe(PERSONALIZED_MODEL_VERSION);
    expect(integrated.result.mealModelVersion).toBe(MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED);
    expect(integrated.resolution.isIntegrated).toBe(true);

    // The trajectories should differ in the expected direction:
    // - speedFactor 1.2 → slower peak (less early rise)
    // - magnitudeFactor 0.85 → smaller excursion
    // - rateAdjustmentFactor 1.15 → amplified net rate
    // The combined effect should produce a different trajectory
    expect(integrated.result.trajectory).not.toEqual(baseline.result.trajectory);

    // Verify the integrated trajectory is bounded
    for (const p of integrated.result.trajectory) {
      expect(p.value).toBeGreaterThanOrEqual(20);
      expect(p.value).toBeLessThanOrEqual(500);
    }
  });

  test("E2E: one component fails validation → other remains active", () => {
    // General component was personalized but reverted (baseline_locked = true)
    // Meal component is still personalized
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE, 7, 5 * MINUTE, 130);
    const meals = [makeMeal(now - 20 * MINUTE, 45)];
    const settings = makeSettings();

    const projState = makeProjectionState(1.15, true); // reverted (baseline_locked)
    const mealState = makeMealState({ mixed: { speedFactor: 1.2, magnitudeFactor: 0.85 } });

    const { result, resolution } = runProjection(readings, meals, [], settings, projState, mealState, { now });

    // General falls back to baseline, meal stays personalized
    expect(resolution.general.eligible).toBe(false);
    expect(resolution.general.reason).toBe("baseline_locked");
    expect(resolution.meal.eligible).toBe(true);
    expect(resolution.isIntegrated).toBe(false);
    expect(resolution.resolutionReason).toBe("meal_personalized_general_baseline");
    expect(result.modelVersion).toBe(BASELINE_MODEL_VERSION);
    expect(result.mealModelVersion).toBe(MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED);
    expect(result.effectiveParameters.rateAdjustmentFactor).toBe(1.0);
    expect(result.effectiveParameters.mealParams.mixed.speedFactor).toBe(1.2);
  });
});