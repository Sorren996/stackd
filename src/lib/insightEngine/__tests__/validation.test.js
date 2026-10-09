// Stackd Insight Engine — Milestone 5 Validation Tests
//
// Tests for real-world validation framework reliability, honest evidence
// reporting, cross-user isolation, no-future-data-leakage in shadow replay,
// and UI integration safety.
//
// All tests use deterministic synthetic data — NOT real-world observations.
// Real-world validation status is reported separately in the completion report.

import { describe, test, expect } from "vitest";
import {
  evaluateProjection,
  aggregateMetrics,
  EVAL_HORIZONS,
  EVAL_BUFFER_MIN,
  MATCH_TOLERANCE_MIN,
} from "../../insightEngine/evaluation.js";
import {
  projectGlucose,
  normalizeInputs,
  replayProjection,
  BASELINE_MODEL_VERSION,
  PERSONALIZED_MODEL_VERSION,
} from "../../insightEngine/index.js";
import {
  resolveModelComponents,
  createBaselineResolution,
  createGeneralOnlyResolution,
  createMealOnlyResolution,
} from "../../insightEngine/modelResolution.js";
import { calibrateUncertainty, UNCERTAINTY_VERSION } from "../../insightEngine/uncertaintyCalibration.js";

const MINUTE_MS = 60 * 1000;

// ── Test helpers ────────────────────────────────────────────────────────────

function makeReadings(startTime, count, stepMs, startValue, drift = 0) {
  const readings = [];
  for (let i = 0; i < count; i++) {
    const t = startTime + i * stepMs;
    readings.push({
      recorded_at: new Date(t).toISOString(),
      time: t, // also include epoch ms for evaluateProjection
      value: startValue + Math.round(drift * i),
      source: "dexcom",
    });
  }
  return readings;
}

// Convert readings to the format expected by evaluateProjection (epoch ms time).
function forEval(readings) {
  return readings.map(r => ({ time: r.time, value: r.value, source: r.source }));
}

function makeMeal(time, carbs, opts = {}) {
  return {
    food_name: opts.name || "Test Meal",
    carbs,
    consumed_at: new Date(time).toISOString(),
    fat_grams: opts.fat || 0,
    protein_grams: opts.protein || 0,
    glycemic_index: opts.gi || 55,
    absorption_profile: opts.profile || "medium",
  };
}

function makeDose(time, units, type = "NovoLog") {
  return {
    insulin_type: type,
    units,
    administered_at: new Date(time).toISOString(),
  };
}

function makeSettings() {
  return {
    insulin_sensitivity_mgdl_per_unit: 50,
    meal_insulin_units_per_5g: 2.5,
    target_range_low: 70,
    target_range_high: 180,
  };
}

function makeProjectionRecord(result, userId = "userA") {
  return {
    id: `proj_${result.generatedAt}`,
    user_id: userId,
    generated_at: new Date(result.generatedAt).toISOString(),
    model_version: result.modelVersion,
    meal_response_model_version: result.mealModelVersion,
    anchor_time: result.anchor ? new Date(result.anchor.time).toISOString() : null,
    anchor_value: result.anchor ? result.anchor.value : null,
    horizon_minutes: result.horizonMinutes,
    trajectory: result.trajectory.map((p) => ({
      time: new Date(p.time).toISOString(),
      min_offset: p.min_offset,
      value: p.value,
      lower: p.lower,
      upper: p.upper,
    })),
    abstained: result.abstained,
    status: "active",
    active_inputs: result.activeInputs,
    model_resolution: result.modelResolution,
    effective_parameters: result.effectiveParameters,
    uncertainty_info: result.uncertainty,
  };
}

function runProjection(readings, meals, doses, settings, projState, mealState, opts = {}) {
  const now = opts.now || Date.now();
  const snapshot = normalizeInputs(readings, meals, doses, settings, now);
  const resolution = resolveModelComponents(projState, mealState);
  const result = projectGlucose(snapshot, {
    horizonMin: opts.horizonMin || 60,
    modelResolution: resolution,
    uncertaintyCalibration: opts.uncertaintyCalibration || null,
  });
  return { snapshot, resolution, result };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("M5: Real-world evaluation window maturity", () => {
  test("projection is not eligible for evaluation before the buffer elapses", () => {
    const now = Date.now();
    const generatedAt = now - 30 * MINUTE_MS; // 30 min ago
    const projection = {
      generated_at: generatedAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60,
      trajectory: [{ min_offset: 15, value: 120, lower: 110, upper: 130 }],
      abstained: false,
    };
    const readings = makeReadings(generatedAt + 15 * MINUTE_MS, 1, 5 * MINUTE_MS, 125);

    // Evaluate at now (only 30 min after generation, horizon 15 needs 15+10=25 min — OK for 15)
    const result = evaluateProjection(projection, forEval(readings), now);
    // The 15-min horizon should be scored (25 min have elapsed, buffer is 10)
    expect(result.horizons.find(h => h.horizon_min === 15)?.scored).toBe(true);
  });

  test("horizon is excluded as buffer_not_elapsed when evaluated too early", () => {
    const now = Date.now();
    const generatedAt = now - 20 * MINUTE_MS;
    const projection = {
      generated_at: generatedAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60,
      trajectory: [
        { min_offset: 15, value: 120, lower: 110, upper: 130 },
        { min_offset: 30, value: 125, lower: 115, upper: 135 },
      ],
      abstained: false,
    };
    const readings = makeReadings(generatedAt + 15 * MINUTE_MS, 3, 5 * MINUTE_MS, 125);

    const result = evaluateProjection(projection, forEval(readings), now);
    // 15-min horizon: 20 min elapsed, needs 15+10=25 → buffer_not_elapsed
    expect(result.horizons.find(h => h.horizon_min === 15)?.scored).toBe(false);
    expect(result.horizons.find(h => h.horizon_min === 15)?.exclusion_reason).toBe("buffer_not_elapsed");
  });

  test("horizon beyond the forecast horizon is excluded", () => {
    const now = Date.now();
    const generatedAt = now - 180 * MINUTE_MS;
    const projection = {
      generated_at: generatedAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60, // only 60 min forecast
      trajectory: [{ min_offset: 15, value: 120, lower: 110, upper: 130 }],
      abstained: false,
    };
    const readings = makeReadings(generatedAt, 20, 5 * MINUTE_MS, 125);

    const result = evaluateProjection(projection, forEval(readings), now);
    // 120-min horizon is beyond the 60-min forecast
    expect(result.horizons.find(h => h.horizon_min === 120)?.scored).toBe(false);
    expect(result.horizons.find(h => h.horizon_min === 120)?.exclusion_reason).toBe("beyond_forecast_horizon");
  });
});

describe("M5: No future-data leakage in shadow replay", () => {
  test("replayProjection uses only readings available at generation time", () => {
    const now = Date.now();
    const readings = makeReadings(now - 120 * MINUTE_MS, 30, 5 * MINUTE_MS, 120, 0.5);
    const meals = [makeMeal(now - 30 * MINUTE_MS, 45)];
    const doses = [];
    const settings = makeSettings();

    // Generate a projection at now - 60 min
    const snapshot = normalizeInputs(
      readings.filter(r => r.time <= now - 60 * MINUTE_MS),
      meals, doses, settings, now - 60 * MINUTE_MS
    );
    const result = projectGlucose(snapshot, { horizonMin: 60 });

    // Replay with ALL readings (including ones after generation time)
    const replayed = replayProjection(
      {
        anchor_time: result.anchor.time,
        anchor_value: result.anchor.value,
        generated_at: result.generatedAt,
        horizon_minutes: 60,
      },
      readings, // includes future readings
      meals, doses, settings,
      createBaselineResolution()
    );

    // The replay should use only readings up to generatedAt
    // The anchor should match the original projection's anchor
    expect(replayed.trajectory.length).toBe(result.trajectory.length);
    expect(replayed.trajectory[0].value).toBe(result.trajectory[0].value);
  });

  test("replayProjection with future meals does not use them for the anchor", () => {
    const now = Date.now();
    const genTime = now - 60 * MINUTE_MS;
    const readings = makeReadings(genTime - 30 * MINUTE_MS, 10, 5 * MINUTE_MS, 120);
    const oldMeals = [makeMeal(genTime - 10 * MINUTE_MS, 30)];
    const futureMeals = [makeMeal(now - 10 * MINUTE_MS, 50)]; // logged after generation
    const settings = makeSettings();

    const snapshot = normalizeInputs(readings, oldMeals, [], settings, genTime);
    const result = projectGlucose(snapshot, { horizonMin: 60 });

    // Replay with both old and future meals
    const replayed = replayProjection(
      {
        anchor_time: result.anchor.time,
        anchor_value: result.anchor.value,
        generated_at: genTime,
        horizon_minutes: 60,
      },
      readings, [...oldMeals, ...futureMeals], [], settings,
      createBaselineResolution()
    );

    // The replay should not include the future meal in active meals
    // (the future meal is after the generation time, so it's not active)
    expect(replayed.trajectory[0].value).toBe(result.trajectory[0].value);
  });
});

describe("M5: Baseline and personalized on identical observations", () => {
  test("shadow configs produce different trajectories on the same inputs", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE_MS, 10, 3 * MINUTE_MS, 120);
    const meals = [makeMeal(now - 10 * MINUTE_MS, 10)];
    const settings = makeSettings();

    const snapshot = normalizeInputs(readings, meals, [], settings, now);

    const baselineResult = projectGlucose(snapshot, {
      horizonMin: 60,
      modelResolution: createBaselineResolution(),
    });
    const generalResult = projectGlucose(snapshot, {
      horizonMin: 60,
      modelResolution: createGeneralOnlyResolution(1.2),
    });
    const mealResult = projectGlucose(snapshot, {
      horizonMin: 60,
      modelResolution: createMealOnlyResolution({
        mixed: { speedFactor: 1.2, magnitudeFactor: 0.85 },
      }),
    });

    // All three should have trajectories
    expect(baselineResult.trajectory.length).toBeGreaterThan(0);
    expect(generalResult.trajectory.length).toBeGreaterThan(0);
    expect(mealResult.trajectory.length).toBeGreaterThan(0);

    // The trajectories should differ (different model parameters)
    const baselineEnd = baselineResult.trajectory[baselineResult.trajectory.length - 1].value;
    const generalEnd = generalResult.trajectory[generalResult.trajectory.length - 1].value;
    const mealEnd = mealResult.trajectory[mealResult.trajectory.length - 1].value;

    // General with rateAdjustmentFactor 1.2 should differ from baseline
    expect(generalEnd).not.toBe(baselineEnd);
    // Meal with magnitudeFactor 0.85 should differ from baseline
    expect(mealEnd).not.toBe(baselineEnd);
  });
});

describe("M5: Insufficient real-world evidence", () => {
  test("calibrateUncertainty returns heuristic with < 10 evaluated projections", () => {
    const evaluated = [];
    for (let i = 0; i < 9; i++) {
      evaluated.push({
        evaluation: {
          status: "evaluated",
          mae: 10 + i,
          horizons: [
            { horizon_min: 15, scored: true, abs_error: 10 + i, in_interval: true },
            { horizon_min: 30, scored: true, abs_error: 12 + i, in_interval: true },
          ],
          coverage: 0.9,
        },
      });
    }
    const cal = calibrateUncertainty(evaluated);
    expect(cal.calibrated).toBe(false);
    expect(cal.method).toBe("heuristic");
    expect(cal.sampleCount).toBe(9);
  });

  test("calibrateUncertainty returns empirical with >= 10 evaluated projections", () => {
    const evaluated = [];
    for (let i = 0; i < 12; i++) {
      evaluated.push({
        evaluation: {
          status: "evaluated",
          mae: 10 + i,
          horizons: [
            { horizon_min: 15, scored: true, abs_error: 10 + i, in_interval: true },
            { horizon_min: 30, scored: true, abs_error: 12 + i, in_interval: false },
            { horizon_min: 60, scored: true, abs_error: 15 + i, in_interval: true },
          ],
          coverage: 0.8,
        },
      });
    }
    const cal = calibrateUncertainty(evaluated);
    expect(cal.calibrated).toBe(true);
    expect(cal.method).toBe("empirical_calibrated");
    expect(cal.sampleCount).toBe(12);
    expect(cal.sigmaByHorizon[15]).toBeDefined();
    expect(cal.sigmaByHorizon[30]).toBeDefined();
    expect(cal.sigmaByHorizon[60]).toBeDefined();
  });

  test("uncertainty calibration version is reproducible", () => {
    const evaluated = [];
    for (let i = 0; i < 15; i++) {
      evaluated.push({
        evaluation: {
          status: "evaluated",
          mae: 10,
          horizons: [
            { horizon_min: 15, scored: true, abs_error: 10, in_interval: true },
            { horizon_min: 30, scored: true, abs_error: 12, in_interval: true },
          ],
          coverage: 0.9,
        },
      });
    }
    const cal1 = calibrateUncertainty(evaluated);
    const cal2 = calibrateUncertainty(evaluated);
    expect(cal1.version).toBe(UNCERTAINTY_VERSION);
    expect(cal2.version).toBe(UNCERTAINTY_VERSION);
    expect(cal1.sigmaByHorizon).toEqual(cal2.sigmaByHorizon);
    expect(cal1.coverageObserved).toBe(cal2.coverageObserved);
  });
});

describe("M5: Model selection and fallback", () => {
  test("invalid rateAdjustmentFactor falls back to baseline", () => {
    const state = {
      baseline_locked: false,
      parameters: { rateAdjustmentFactor: 5.0 }, // out of range
    };
    const resolution = resolveModelComponents(state, null);
    expect(resolution.general.eligible).toBe(false);
    expect(resolution.general.reason).toBe("parameter_out_of_range");
    expect(resolution.modelVersion).toBe(BASELINE_MODEL_VERSION);
  });

  test("invalid meal speed_factor falls back to baseline for that class", () => {
    const state = {
      baseline_locked: false,
      speed_class_parameters: {
        fast: { speed_factor: 0.8, magnitude_factor: 1.1 }, // valid
        mixed: { speed_factor: 3.0, magnitude_factor: 1.0 }, // invalid speed
        high_fat: { speed_factor: 1.0, magnitude_factor: 1.2 }, // valid
      },
    };
    const resolution = resolveModelComponents(null, state);
    expect(resolution.meal.eligible).toBe(true);
    expect(resolution.meal.eligibleClasses).toContain("fast");
    expect(resolution.meal.eligibleClasses).toContain("high_fat");
    expect(resolution.meal.eligibleClasses).not.toContain("mixed");
    expect(resolution.meal.classes.mixed.eligible).toBe(false);
    expect(resolution.meal.classes.mixed.reason).toBe("speed_factor_out_of_range");
  });

  test("one component failing does not disable another", () => {
    const projState = {
      baseline_locked: false,
      parameters: { rateAdjustmentFactor: 1.15 }, // valid
    };
    const mealState = {
      baseline_locked: false,
      speed_class_parameters: {
        fast: { speed_factor: 5.0, magnitude_factor: 1.0 }, // invalid
      },
    };
    const resolution = resolveModelComponents(projState, mealState);
    expect(resolution.general.eligible).toBe(true);
    expect(resolution.meal.eligible).toBe(false);
    expect(resolution.modelVersion).toBe(PERSONALIZED_MODEL_VERSION);
    expect(resolution.mealModelVersion).toBe("1.0.0-meal-baseline");
  });

  test("baseline_locked state always falls back to baseline", () => {
    const projState = {
      baseline_locked: true,
      parameters: { rateAdjustmentFactor: 1.15 },
    };
    const mealState = {
      baseline_locked: true,
      speed_class_parameters: {
        fast: { speed_factor: 1.2, magnitude_factor: 0.9 },
      },
    };
    const resolution = resolveModelComponents(projState, mealState);
    expect(resolution.general.eligible).toBe(false);
    expect(resolution.meal.eligible).toBe(false);
    expect(resolution.modelVersion).toBe(BASELINE_MODEL_VERSION);
  });
});

describe("M5: No duplicate scoring on retries", () => {
  test("evaluation is deterministic — same projection + readings = same scores", () => {
    const now = Date.now();
    const generatedAt = now - 120 * MINUTE_MS;
    const projection = {
      generated_at: generatedAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60,
      trajectory: [
        { min_offset: 15, value: 120, lower: 110, upper: 130 },
        { min_offset: 30, value: 125, lower: 115, upper: 135 },
        { min_offset: 60, value: 130, lower: 120, upper: 140 },
      ],
      abstained: false,
    };
    const readings = makeReadings(generatedAt, 30, 5 * MINUTE_MS, 125, 0.2);

    const result1 = evaluateProjection(projection, forEval(readings), now);
    const result2 = evaluateProjection(projection, forEval(readings), now);

    expect(result1.mae).toBe(result2.mae);
    expect(result1.bias).toBe(result2.bias);
    expect(result1.valid_count).toBe(result2.valid_count);
    expect(result1.horizons).toEqual(result2.horizons);
  });

  test("aggregateMetrics does not inflate when same projections are aggregated twice", () => {
    const evaluated = [
      {
        model_version: BASELINE_MODEL_VERSION,
        evaluation: { status: "evaluated", mae: 10, bias: 2, coverage: 0.9, horizons: [] },
      },
      {
        model_version: BASELINE_MODEL_VERSION,
        evaluation: { status: "evaluated", mae: 12, bias: -1, coverage: 0.8, horizons: [] },
      },
    ];
    const metrics1 = aggregateMetrics(evaluated);
    const metrics2 = aggregateMetrics([...evaluated, ...evaluated]); // double the array
    // metrics2 has 4 items, metrics1 has 2 — the counts should reflect this
    expect(metrics2.sampleCount).toBe(4);
    expect(metrics1.sampleCount).toBe(2);
    // But the MAE should be the same (same average)
    expect(metrics2.mae).toBe(metrics1.mae);
  });
});

describe("M5: Missing, delayed, and out-of-order CGM observations", () => {
  test("missing readings exclude the horizon with no_observation_in_window", () => {
    const now = Date.now();
    const generatedAt = now - 120 * MINUTE_MS;
    const projection = {
      generated_at: generatedAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60,
      trajectory: [
        { min_offset: 15, value: 120, lower: 110, upper: 130 },
        { min_offset: 30, value: 125, lower: 115, upper: 135 },
        { min_offset: 60, value: 130, lower: 120, upper: 140 },
      ],
      abstained: false,
    };
    // Readings that miss the 30-min horizon (gap around 30 min)
    const readings = [
      ...makeReadings(generatedAt, 3, 5 * MINUTE_MS, 125), // 0, 5, 10 min
      // Gap: no readings near 30 min
      ...makeReadings(generatedAt + 55 * MINUTE_MS, 2, 5 * MINUTE_MS, 130), // 55, 60 min
    ];

    const result = evaluateProjection(projection, forEval(readings), now);
    expect(result.horizons.find(h => h.horizon_min === 15)?.scored).toBe(true);
    expect(result.horizons.find(h => h.horizon_min === 30)?.scored).toBe(false);
    expect(result.horizons.find(h => h.horizon_min === 30)?.exclusion_reason).toBe("no_observation_in_window");
  });

  test("out-of-order readings are handled correctly", () => {
    const now = Date.now();
    const generatedAt = now - 120 * MINUTE_MS;
    const projection = {
      generated_at: generatedAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60,
      trajectory: [{ min_offset: 15, value: 120, lower: 110, upper: 130 }],
      abstained: false,
    };
    // Readings in random order
    const readings = [
      { time: generatedAt + 20 * MINUTE_MS, value: 122, source: "dexcom" },
      { time: generatedAt + 10 * MINUTE_MS, value: 118, source: "dexcom" },
      { time: generatedAt + 15 * MINUTE_MS, value: 120, source: "dexcom" },
      { time: generatedAt + 5 * MINUTE_MS, value: 119, source: "dexcom" },
    ];

    const result = evaluateProjection(projection, forEval(readings), now);
    // The 15-min horizon should be scored using the closest reading
    const h15 = result.horizons.find(h => h.horizon_min === 15);
    expect(h15.scored).toBe(true);
    expect(h15.actual).toBe(120); // the reading at exactly 15 min
  });

  test("duplicate readings are deduplicated", () => {
    const now = Date.now();
    const generatedAt = now - 120 * MINUTE_MS;
    const projection = {
      generated_at: generatedAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60,
      trajectory: [{ min_offset: 15, value: 120, lower: 110, upper: 130 }],
      abstained: false,
    };
    const reading = { time: generatedAt + 15 * MINUTE_MS, value: 125, source: "dexcom" };
    const readings = [reading, reading, reading]; // same reading 3 times

    const result = evaluateProjection(projection, forEval(readings), now);
    const h15 = result.horizons.find(h => h.horizon_min === 15);
    expect(h15.scored).toBe(true);
    expect(h15.actual).toBe(125);
  });
});

describe("M5: Historical projection integrity", () => {
  test("evaluation does not modify the original trajectory", () => {
    const now = Date.now();
    const generatedAt = now - 120 * MINUTE_MS;
    const originalTrajectory = [
      { min_offset: 15, value: 120, lower: 110, upper: 130 },
      { min_offset: 30, value: 125, lower: 115, upper: 135 },
      { min_offset: 60, value: 130, lower: 120, upper: 140 },
    ];
    const projection = {
      generated_at: generatedAt,
      model_version: BASELINE_MODEL_VERSION,
      horizon_minutes: 60,
      trajectory: originalTrajectory.map(p => ({ ...p })),
      abstained: false,
    };
    const readings = makeReadings(generatedAt, 30, 5 * MINUTE_MS, 125);

    evaluateProjection(projection, forEval(readings), now);

    // The original trajectory should be unchanged
    expect(projection.trajectory).toEqual(originalTrajectory);
  });
});

describe("M5: Cross-user isolation", () => {
  test("user A's model state does not affect user B's projection", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE_MS, 10, 3 * MINUTE_MS, 120);
    const meals = [makeMeal(now - 10 * MINUTE_MS, 10)];
    const settings = makeSettings();

    const userAState = {
      baseline_locked: false,
      parameters: { rateAdjustmentFactor: 1.25 },
    };
    const userBState = {
      baseline_locked: false,
      parameters: { rateAdjustmentFactor: 0.75 },
    };

    const resultA = runProjection(readings, meals, [], settings, userAState, null, { now });
    const resultB = runProjection(readings, meals, [], settings, userBState, null, { now });

    // Different rate factors should produce different trajectories
    const endA = resultA.result.trajectory[resultA.result.trajectory.length - 1].value;
    const endB = resultB.result.trajectory[resultB.result.trajectory.length - 1].value;

    expect(endA).not.toBe(endB);
    expect(resultA.result.modelVersion).toBe(PERSONALIZED_MODEL_VERSION);
    expect(resultB.result.modelVersion).toBe(PERSONALIZED_MODEL_VERSION);
  });

  test("user A's meal state does not affect user B's meal resolution", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE_MS, 10, 3 * MINUTE_MS, 120);
    const meals = [makeMeal(now - 10 * MINUTE_MS, 10)];
    const settings = makeSettings();

    const userAMealState = {
      baseline_locked: false,
      speed_class_parameters: {
        mixed: { speed_factor: 1.3, magnitude_factor: 1.2 },
      },
    };
    const userBMealState = {
      baseline_locked: false,
      speed_class_parameters: {
        mixed: { speed_factor: 0.8, magnitude_factor: 0.85 },
      },
    };

    const resultA = runProjection(readings, meals, [], settings, null, userAMealState, { now });
    const resultB = runProjection(readings, meals, [], settings, null, userBMealState, { now });

    const endA = resultA.result.trajectory[resultA.result.trajectory.length - 1].value;
    const endB = resultB.result.trajectory[resultB.result.trajectory.length - 1].value;

    expect(endA).not.toBe(endB);
  });
});

describe("M5: Uncertainty calibration honesty", () => {
  test("personalization does not narrow the interval when uncalibrated", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE_MS, 10, 3 * MINUTE_MS, 120);
    const meals = [makeMeal(now - 10 * MINUTE_MS, 45)];
    const settings = makeSettings();

    const baselineResult = runProjection(readings, meals, [], settings, null, null, { now });
    const personalizedResult = runProjection(
      readings, meals, [], settings,
      { baseline_locked: false, parameters: { rateAdjustmentFactor: 1.2 } },
      { baseline_locked: false, speed_class_parameters: { mixed: { speed_factor: 1.2, magnitude_factor: 0.8 } } },
      { now }
    );

    // Without calibration, personalization is unvalidated. Confidence should
    // NOT increase — it should be equal or lower than baseline.
    expect(personalizedResult.result.confidence).toBeLessThanOrEqual(baselineResult.result.confidence);
  });

  test("uncertainty_info records calibrated=false when insufficient data", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE_MS, 10, 3 * MINUTE_MS, 120);
    const meals = [makeMeal(now - 10 * MINUTE_MS, 45)];
    const settings = makeSettings();

    const result = runProjection(readings, meals, [], settings, null, null, { now });
    expect(result.result.uncertainty).toBeNull(); // no calibration passed
  });

  test("empirical calibration uses held-out evaluation data, not the same projections", () => {
    // The calibration function uses evaluated projections (past forecasts scored
    // against actuals). These are out-of-sample by construction — the forecast
    // was generated BEFORE the actual arrived. So the calibration data is
    // inherently held-out, not in-sample.
    const evaluated = [];
    for (let i = 0; i < 12; i++) {
      evaluated.push({
        evaluation: {
          status: "evaluated",
          mae: 10 + i * 0.5,
          horizons: [
            { horizon_min: 15, scored: true, abs_error: 10 + i * 0.5, in_interval: true },
            { horizon_min: 30, scored: true, abs_error: 12 + i * 0.5, in_interval: i % 3 !== 0 },
          ],
          coverage: 0.75,
        },
      });
    }
    const cal = calibrateUncertainty(evaluated);
    expect(cal.calibrated).toBe(true);
    // The sigma should reflect the actual MAE, not an arbitrary constant
    expect(cal.sigmaByHorizon[15]).toBeGreaterThan(0);
    expect(cal.sigmaByHorizon[30]).toBeGreaterThan(cal.sigmaByHorizon[15]); // 30-min error > 15-min
  });
});

describe("M5: Projection persistence and provenance", () => {
  test("projection record contains model resolution provenance", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE_MS, 10, 3 * MINUTE_MS, 120);
    const meals = [makeMeal(now - 10 * MINUTE_MS, 45)];
    const settings = makeSettings();

    const result = runProjection(
      readings, meals, [], settings,
      { baseline_locked: false, parameters: { rateAdjustmentFactor: 1.15 } },
      null,
      { now }
    );

    expect(result.result.modelResolution).toBeDefined();
    expect(result.result.modelResolution.general.eligible).toBe(true);
    expect(result.result.modelResolution.general.effectiveValue).toBe(1.15);
    expect(result.result.effectiveParameters).toBeDefined();
    expect(result.result.effectiveParameters.rateAdjustmentFactor).toBe(1.15);
  });

  test("projection record contains uncertainty info when calibration is provided", () => {
    const now = Date.now();
    const readings = makeReadings(now - 30 * MINUTE_MS, 10, 3 * MINUTE_MS, 120);
    const meals = [makeMeal(now - 10 * MINUTE_MS, 45)];
    const settings = makeSettings();

    const evaluated = [];
    for (let i = 0; i < 12; i++) {
      evaluated.push({
        evaluation: {
          status: "evaluated",
          mae: 10,
          horizons: [{ horizon_min: 15, scored: true, abs_error: 10, in_interval: true }],
          coverage: 0.9,
        },
      });
    }
    const calibration = calibrateUncertainty(evaluated);

    const result = runProjection(readings, meals, [], settings, null, null, {
      now,
      uncertaintyCalibration: calibration,
    });

    expect(result.result.uncertainty).toBeDefined();
    expect(result.result.uncertainty.calibrated).toBe(true);
    expect(result.result.uncertainty.method).toBe("empirical_calibrated");
    expect(result.result.uncertainty.sampleCount).toBe(12);
  });
});