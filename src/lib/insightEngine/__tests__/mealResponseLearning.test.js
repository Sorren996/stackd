import { describe, it, expect } from "vitest";
import {
  buildMealTrainingObservation,
  aggregateMealClassObservations,
  shouldUpdateMealClass,
  applyMealClassUpdate,
  validateMealPersonalization,
  revertMealClassToBaseline,
  getMealModelVersion,
  resolveMealModelParams,
  MEAL_EVALUATION_VERSION,
  MIN_MEAL_SAMPLES_FOR_LEARNING,
  MIN_MEAL_SAMPLES_FOR_VALIDATION,
  MIN_TIMING_DEVIATION_MIN,
  MIN_MAGNITUDE_DEVIATION_MGDL,
  MEAL_SHRINKAGE_LAMBDA,
  MIN_MEAL_SPEED_FACTOR,
  MAX_MEAL_SPEED_FACTOR,
  MIN_MEAL_MAGNITUDE_FACTOR,
  MAX_MEAL_MAGNITUDE_FACTOR,
  MIN_MEAL_FACTOR_CHANGE,
  MEAL_BASELINE_TOLERANCE_MGDL,
  MIN_VALID_PEAK_MIN,
  MAX_VALID_PEAK_MIN,
  MIN_SPEED_RATIO,
  MAX_SPEED_RATIO,
  MIN_MAGNITUDE_RATIO,
  MAX_MAGNITUDE_RATIO,
  MIN_VALID_RISE_MGDL,
} from "../mealResponseLearning";
import {
  MEAL_RESPONSE_MODEL_VERSION_BASELINE,
  MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED,
} from "../index";

const MINUTE_MS = 60 * 1000;

// ── Test helpers ───────────────────────────────────────────────────────────

// ISF=50, unitsPer5g=0.5 (1 unit per 10g carbs) → mgPerGram = 50 * 0.1 = 5
// For 45g carbs: predictedRise = 225 mg/dL (realistic)
const calibratedSettings = {
  insulin_sensitivity_mgdl_per_unit: 50,
  meal_insulin_units_per_5g: 0.5,
};

const uncalibratedSettings = {};

function makeAnalysis({
  mealLogId = "meal-1",
  mealTime = "2026-01-01T12:00:00Z",
  peakTime = "2026-01-01T12:45:00Z", // 45 min after meal
  startingGlucose = 120,
  maxRise = 50,
  carbs = 45,
  fatGrams = 0,
  proteinGrams = 0,
  absorptionProfile = "medium",
  glycemicIndex = 50,
  confoundingEvents = [],
  analysisStatus = "complete",
} = {}) {
  return {
    meal_log_id: mealLogId,
    meal_time: mealTime,
    peak_time: peakTime,
    starting_glucose: startingGlucose,
    maximum_glucose_rise: maxRise,
    carbs_logged: carbs,
    confounding_events: confoundingEvents,
    analysis_status: analysisStatus,
  };
}

function makeMealEntry({
  id = "meal-1",
  carbs = 45,
  fatGrams = 0,
  proteinGrams = 0,
  absorptionProfile = "medium",
  glycemicIndex = 50,
  consumedAt = "2026-01-01T12:00:00Z",
} = {}) {
  return {
    id,
    carbs,
    fat_grams: fatGrams,
    protein_grams: proteinGrams,
    absorption_profile: absorptionProfile,
    glycemic_index: glycemicIndex,
    consumed_at: consumedAt,
  };
}

const baselineState = {
  model_version: MEAL_RESPONSE_MODEL_VERSION_BASELINE,
  speed_class_parameters: {},
  sample_counts_by_class: {},
  evaluation_summary: {},
  baseline_locked: true,
  update_history: [],
};

// ───────────────────────────────────────────────────────────────────────────
// 1. Training observation construction: one meal = one observation
// ───────────────────────────────────────────────────────────────────────────

describe("1. Training observation construction", () => {
  it("builds a valid observation from a completed meal analysis", () => {
    const analysis = makeAnalysis({ peakTime: "2026-01-01T12:45:00Z" }); // 45 min peak
    const meal = makeMealEntry({ absorptionProfile: "medium" });
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.excluded).toBe(false);
    expect(obs.speed_class).toBe("mixed");
    expect(obs.actual_peak_min).toBe(45);
    expect(obs.baseline_peak_min).toBe(60); // mixed class baseline
    expect(obs.observed_speed_ratio).toBeCloseTo(45 / 60, 2);
    expect(obs.calibrated).toBe(true);
  });

  it("classifies high-fat meals as high_fat speed class", () => {
    const analysis = makeAnalysis({ fatGrams: 50 });
    const meal = makeMealEntry({ fatGrams: 50 });
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.speed_class).toBe("high_fat");
    expect(obs.baseline_peak_min).toBe(40); // high_fat baseline
  });

  it("classifies fast-absorbing meals as fast speed class", () => {
    const analysis = makeAnalysis({ absorptionProfile: "fast", glycemicIndex: 75 });
    const meal = makeMealEntry({ absorptionProfile: "fast", glycemicIndex: 75 });
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.speed_class).toBe("fast");
    expect(obs.baseline_peak_min).toBe(30); // fast baseline
  });

  it("computes predicted rise from carbs and user settings when calibrated", () => {
    // 45g carbs, ISF=50, unitsPer5g=0.5 → mgPerGram = 50 * 0.1 = 5
    // predictedRise = 45 * 5 = 225 mg/dL
    const analysis = makeAnalysis({ carbs: 45 });
    const meal = makeMealEntry({ carbs: 45 });
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.predicted_rise_mgdl).toBe(225);
    expect(obs.observed_magnitude_ratio).toBeCloseTo(50 / 225, 3);
  });

  it("returns null magnitude ratio when uncalibrated", () => {
    const analysis = makeAnalysis({ carbs: 45 });
    const meal = makeMealEntry({ carbs: 45 });
    const obs = buildMealTrainingObservation(analysis, meal, uncalibratedSettings);

    expect(obs.calibrated).toBe(false);
    expect(obs.observed_magnitude_ratio).toBe(null);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Exclusion rules: confounders, missing data, outliers
// ───────────────────────────────────────────────────────────────────────────

describe("2. Exclusion rules", () => {
  it("excludes observations with overlapping meal confounder", () => {
    const analysis = makeAnalysis({ confoundingEvents: ["overlapping_meal"] });
    const meal = makeMealEntry();
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.excluded).toBe(true);
    expect(obs.exclusion_reason).toContain("confounder:overlapping_meal");
  });

  it("excludes observations with rescue carbs confounder", () => {
    const analysis = makeAnalysis({ confoundingEvents: ["rescue_carbs"] });
    const meal = makeMealEntry();
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.excluded).toBe(true);
    expect(obs.exclusion_reason).toContain("confounder:rescue_carbs");
  });

  it("excludes observations with active insulin at start", () => {
    const analysis = makeAnalysis({ confoundingEvents: ["active_insulin_at_start"] });
    const meal = makeMealEntry();
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.excluded).toBe(true);
  });

  it("excludes observations with no peak detected", () => {
    const analysis = makeAnalysis({ peakTime: null });
    const meal = makeMealEntry();
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.excluded).toBe(true);
    expect(obs.exclusion_reason).toBe("no_peak_detected");
  });

  it("excludes observations with no starting glucose", () => {
    const analysis = makeAnalysis({ startingGlucose: null });
    const meal = makeMealEntry();
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.excluded).toBe(true);
    expect(obs.exclusion_reason).toBe("no_starting_glucose");
  });

  it("excludes observations with rise below minimum", () => {
    const analysis = makeAnalysis({ maxRise: 3 }); // below MIN_VALID_RISE_MGDL=5
    const meal = makeMealEntry();
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.excluded).toBe(true);
    expect(obs.exclusion_reason).toBe("rise_below_minimum");
  });

  it("excludes observations with peak timing out of range", () => {
    // Peak at 400 min — beyond MAX_VALID_PEAK_MIN=360
    const analysis = makeAnalysis({ peakTime: "2026-01-01T18:40:00Z" });
    const meal = makeMealEntry();
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.excluded).toBe(true);
    expect(obs.exclusion_reason).toBe("peak_timing_out_of_range");
  });

  it("excludes speed ratio outliers", () => {
    // mixed baseline peak = 60. Ratio = 180/60 = 3.0 > MAX_SPEED_RATIO=2.5
    const analysis = makeAnalysis({ peakTime: "2026-01-01T15:00:00Z" }); // 180 min
    const meal = makeMealEntry();
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.excluded).toBe(true);
    expect(obs.exclusion_reason).toBe("speed_ratio_outlier");
  });

  it("excludes magnitude ratio outliers when calibrated", () => {
    // predictedRise = 45 * 5 = 225. actualRise = 4000. ratio = 17.8 > MAX=3.0
    const analysis = makeAnalysis({ carbs: 45, maxRise: 4000 });
    const meal = makeMealEntry({ carbs: 45 });
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.excluded).toBe(true);
    expect(obs.exclusion_reason).toBe("magnitude_ratio_outlier");
  });

  it("does not exclude high_protein_fat as a confounder (it's a class, not a confounder)", () => {
    const analysis = makeAnalysis({ confoundingEvents: ["high_protein_fat"] });
    const meal = makeMealEntry({ fatGrams: 50 });
    const obs = buildMealTrainingObservation(analysis, meal, calibratedSettings);

    expect(obs.excluded).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Aggregation by speed class
// ───────────────────────────────────────────────────────────────────────────

describe("3. Aggregation by speed class", () => {
  it("groups observations by speed class and computes mean speed ratio", () => {
    const observations = [
      { speed_class: "mixed", observed_speed_ratio: 0.8, excluded: false, observed_magnitude_ratio: null, calibrated: false, actual_rise_mgdl: 30, predicted_rise_mgdl: null },
      { speed_class: "mixed", observed_speed_ratio: 1.2, excluded: false, observed_magnitude_ratio: null, calibrated: false, actual_rise_mgdl: 40, predicted_rise_mgdl: null },
      { speed_class: "fast", observed_speed_ratio: 0.9, excluded: false, observed_magnitude_ratio: null, calibrated: false, actual_rise_mgdl: 20, predicted_rise_mgdl: null },
    ];
    const agg = aggregateMealClassObservations(observations, "mixed");

    expect(agg.sampleCount).toBe(2);
    expect(agg.meanSpeedRatio).toBeCloseTo(1.0, 2);
  });

  it("excludes excluded observations from aggregate statistics", () => {
    const observations = [
      { speed_class: "mixed", observed_speed_ratio: 0.8, excluded: false, observed_magnitude_ratio: null, calibrated: false, actual_rise_mgdl: 30, predicted_rise_mgdl: null },
      { speed_class: "mixed", observed_speed_ratio: 2.0, excluded: true, exclusion_reason: "confounder:overlapping_meal", observed_magnitude_ratio: null, calibrated: false, actual_rise_mgdl: 0, predicted_rise_mgdl: null },
    ];
    const agg = aggregateMealClassObservations(observations, "mixed");

    expect(agg.sampleCount).toBe(1);
    expect(agg.excludedCount).toBe(1);
    expect(agg.exclusions[0]).toEqual({ reason: "confounder:overlapping_meal", count: 1 });
  });

  it("returns zero sample count when all observations are excluded", () => {
    const observations = [
      { speed_class: "mixed", observed_speed_ratio: 0, excluded: true, exclusion_reason: "no_peak_detected", observed_magnitude_ratio: null, calibrated: false, actual_rise_mgdl: 0, predicted_rise_mgdl: null },
    ];
    const agg = aggregateMealClassObservations(observations, "mixed");

    expect(agg.sampleCount).toBe(0);
    expect(agg.excludedCount).toBe(1);
    expect(agg.meanSpeedRatio).toBe(1.0);
  });

  it("computes mean timing deviation from baseline", () => {
    // mixed baseline peak = 60. meanSpeedRatio = 1.5 → deviation = 0.5 * 60 = 30
    const observations = [
      { speed_class: "mixed", observed_speed_ratio: 1.5, excluded: false, observed_magnitude_ratio: null, calibrated: false, actual_rise_mgdl: 40, predicted_rise_mgdl: null },
    ];
    const agg = aggregateMealClassObservations(observations, "mixed");

    expect(agg.meanTimingDeviationMin).toBe(30);
  });

  it("computes mean magnitude ratio only when calibrated", () => {
    const observations = [
      { speed_class: "mixed", observed_speed_ratio: 1.0, excluded: false, observed_magnitude_ratio: 0.8, calibrated: true, actual_rise_mgdl: 80, predicted_rise_mgdl: 100 },
      { speed_class: "mixed", observed_speed_ratio: 1.0, excluded: false, observed_magnitude_ratio: 1.2, calibrated: true, actual_rise_mgdl: 120, predicted_rise_mgdl: 100 },
    ];
    const agg = aggregateMealClassObservations(observations, "mixed");

    expect(agg.meanMagnitudeRatio).toBeCloseTo(1.0, 2);
    expect(agg.calibrated).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. No learning before the evidence threshold is met
// ───────────────────────────────────────────────────────────────────────────

describe("4. No learning before the evidence threshold", () => {
  it("does not update with fewer than MIN_MEAL_SAMPLES_FOR_LEARNING observations", () => {
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING - 1,
      meanSpeedRatio: 1.5,
      meanTimingDeviationMin: 30,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(false);
    expect(decision.reason).toBe("insufficient_samples");
  });

  it("does not update when timing deviation is below threshold", () => {
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 1.05, // 0.05 * 60 = 3 min < MIN_TIMING_DEVIATION_MIN=10
      meanTimingDeviationMin: 3,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(false);
    expect(decision.reason).toBe("change_below_threshold");
  });

  it("does not update when magnitude deviation is below threshold", () => {
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 1.0,
      meanTimingDeviationMin: 0,
      meanMagnitudeRatio: 1.05,
      meanMagnitudeDeviationMgdl: 5, // < MIN_MAGNITUDE_DEVIATION_MGDL=10
      calibrated: true,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(false);
    expect(decision.reason).toBe("change_below_threshold");
  });

  it("does not update when the proposed factor change is below MIN_MEAL_FACTOR_CHANGE", () => {
    // State already has speed_factor = 1.03, proposed = 1.05 → change = 0.02 < 0.05
    const state = {
      ...baselineState,
      speed_class_parameters: {
        mixed: { speed_factor: 1.03, magnitude_factor: 1.0, sample_count: 10 },
      },
    };
    const aggregate = {
      sampleCount: 10,
      meanSpeedRatio: 1.07, // shrunk = 1 + 0.07*0.7 = 1.049 → change from 1.03 = 0.019 < 0.05
      meanTimingDeviationMin: 15,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(state, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(false);
    expect(decision.reason).toBe("change_below_threshold");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Guarded adaptive learning: speed factor
// ───────────────────────────────────────────────────────────────────────────

describe("5. Speed factor learning", () => {
  it("updates speed factor when sufficient timing bias is detected (slow peak)", () => {
    // meanSpeedRatio = 1.5 → peak is 50% later than baseline
    // shrunk = 1 + 0.5 * 0.7 = 1.35
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 1.5,
      meanTimingDeviationMin: 30, // > MIN_TIMING_DEVIATION_MIN=10
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedSpeedFactor).toBeGreaterThan(1.0);
    expect(decision.proposedSpeedFactor).toBeCloseTo(1.35, 2);
  });

  it("updates speed factor when peak is systematically early (fast peak)", () => {
    // meanSpeedRatio = 0.6 → peak is 40% earlier than baseline
    // shrunk = 1 + (-0.4) * 0.7 = 0.72
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 0.6,
      meanTimingDeviationMin: 24, // > 10
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedSpeedFactor).toBeLessThan(1.0);
    expect(decision.proposedSpeedFactor).toBeCloseTo(0.72, 2);
  });

  it("clamps speed factor to MAX_MEAL_SPEED_FACTOR", () => {
    // meanSpeedRatio = 3.0 → shrunk = 1 + 2.0*0.7 = 2.4 → clamped to 1.45
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 3.0,
      meanTimingDeviationMin: 120,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedSpeedFactor).toBe(MAX_MEAL_SPEED_FACTOR);
  });

  it("clamps speed factor to MIN_MEAL_SPEED_FACTOR", () => {
    // meanSpeedRatio = 0.1 → shrunk = 1 + (-0.9)*0.7 = 0.37 → clamped to 0.7
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 0.1,
      meanTimingDeviationMin: 54,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedSpeedFactor).toBe(MIN_MEAL_SPEED_FACTOR);
  });

  it("applies shrinkage toward baseline (1.0)", () => {
    // meanSpeedRatio = 1.15 → shrunk = 1 + 0.15*0.7 = 1.105
    // This stays within [0.7, 1.45] so no clamping
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 1.15,
      meanTimingDeviationMin: 9, // 0.15 * 60 = 9 (just under threshold, but we set it explicitly)
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    // With meanTimingDeviationMin = 9 < MIN_TIMING_DEVIATION_MIN=10, no update.
    // Let's use a ratio that produces a deviation >= 10.
    // meanSpeedRatio = 1.2 → deviation = 0.2 * 60 = 12 >= 10
    // shrunk = 1 + 0.2 * 0.7 = 1.14
    const aggregate2 = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 1.2,
      meanTimingDeviationMin: 12,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision2 = shouldUpdateMealClass(baselineState, "mixed", aggregate2);

    expect(decision2.shouldUpdate).toBe(true);
    // 1 + (1.2-1) * (1 - 0.3) = 1 + 0.14 = 1.14
    expect(decision2.proposedSpeedFactor).toBeCloseTo(1.14, 2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Guarded adaptive learning: magnitude factor
// ───────────────────────────────────────────────────────────────────────────

describe("6. Magnitude factor learning", () => {
  it("updates magnitude factor when sufficient magnitude bias is detected (larger excursion)", () => {
    // meanMagnitudeRatio = 1.15 → shrunk = 1 + 0.15*0.7 = 1.105
    // Within [0.7, 1.3] so no clamping
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 1.0,
      meanTimingDeviationMin: 0,
      meanMagnitudeRatio: 1.15,
      meanMagnitudeDeviationMgdl: 30, // > MIN_MAGNITUDE_DEVIATION_MGDL=10
      calibrated: true,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedMagnitudeFactor).toBeGreaterThan(1.0);
    expect(decision.proposedMagnitudeFactor).toBeCloseTo(1.105, 2);
  });

  it("updates magnitude factor when excursion is systematically smaller", () => {
    // meanMagnitudeRatio = 0.6 → shrunk = 1 + (-0.4)*0.7 = 0.72
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 1.0,
      meanTimingDeviationMin: 0,
      meanMagnitudeRatio: 0.6,
      meanMagnitudeDeviationMgdl: 30,
      calibrated: true,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedMagnitudeFactor).toBeLessThan(1.0);
    expect(decision.proposedMagnitudeFactor).toBeCloseTo(0.72, 2);
  });

  it("does not update magnitude factor when uncalibrated", () => {
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 1.0,
      meanTimingDeviationMin: 0,
      meanMagnitudeRatio: 1.5,
      meanMagnitudeDeviationMgdl: 30,
      calibrated: false, // uncalibrated
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    // Speed factor has no update either (timing deviation = 0)
    expect(decision.shouldUpdate).toBe(false);
  });

  it("clamps magnitude factor to MAX_MEAL_MAGNITUDE_FACTOR", () => {
    // meanMagnitudeRatio = 3.0 → shrunk = 1 + 2.0*0.7 = 2.4 → clamped to 1.3
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 1.0,
      meanTimingDeviationMin: 0,
      meanMagnitudeRatio: 3.0,
      meanMagnitudeDeviationMgdl: 100,
      calibrated: true,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedMagnitudeFactor).toBe(MAX_MEAL_MAGNITUDE_FACTOR);
  });

  it("clamps magnitude factor to MIN_MEAL_MAGNITUDE_FACTOR", () => {
    // meanMagnitudeRatio = 0.1 → shrunk = 1 + (-0.9)*0.7 = 0.37 → clamped to 0.7
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 1.0,
      meanTimingDeviationMin: 0,
      meanMagnitudeRatio: 0.1,
      meanMagnitudeDeviationMgdl: 100,
      calibrated: true,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedMagnitudeFactor).toBe(MIN_MEAL_MAGNITUDE_FACTOR);
  });

  it("can update speed and magnitude independently for the same class", () => {
    // Both timing and magnitude have sufficient deviation
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 1.5,
      meanTimingDeviationMin: 30,
      meanMagnitudeRatio: 0.6,
      meanMagnitudeDeviationMgdl: 30,
      calibrated: true,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedSpeedFactor).toBeGreaterThan(1.0);
    expect(decision.proposedMagnitudeFactor).toBeLessThan(1.0);
  });

  it("can update speed without magnitude when only timing is off", () => {
    const aggregate = {
      sampleCount: MIN_MEAL_SAMPLES_FOR_LEARNING,
      meanSpeedRatio: 1.5,
      meanTimingDeviationMin: 30,
      meanMagnitudeRatio: 1.0,
      meanMagnitudeDeviationMgdl: 0, // below threshold
      calibrated: true,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedSpeedFactor).toBeGreaterThan(1.0);
    // Magnitude stays at current (1.0) — no change proposed
    expect(decision.proposedMagnitudeFactor).toBe(1.0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Model state persistence and provenance
// ───────────────────────────────────────────────────────────────────────────

describe("7. Model state persistence and provenance", () => {
  it("records previous and new parameters in update_history", () => {
    const aggregate = {
      sampleCount: 10,
      meanSpeedRatio: 1.5,
      meanTimingDeviationMin: 30,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);
    const { updatedState, provenance } = applyMealClassUpdate(baselineState, "mixed", aggregate, decision);

    expect(provenance).not.toBeNull();
    expect(provenance.previous_params).toBeNull(); // baseline had no params
    expect(provenance.new_params.speed_factor).toBe(decision.proposedSpeedFactor);
    expect(provenance.new_params.magnitude_factor).toBe(1.0); // unchanged
    expect(provenance.sample_count).toBe(10);
    expect(provenance.reason).toBe("systematic_meal_bias_detected");
    expect(provenance.model_version).toBe(MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED);
    expect(provenance.evaluation_version).toBe(MEAL_EVALUATION_VERSION);
  });

  it("appends to update_history without losing previous entries", () => {
    const stateWithHistory = {
      ...baselineState,
      update_history: [
        { timestamp: 1000, speed_class: "fast", reason: "old_update" },
      ],
    };
    const aggregate = {
      sampleCount: 10,
      meanSpeedRatio: 1.5,
      meanTimingDeviationMin: 30,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(stateWithHistory, "mixed", aggregate);
    const { updatedState } = applyMealClassUpdate(stateWithHistory, "mixed", aggregate, decision);

    expect(updatedState.update_history.length).toBe(2);
    expect(updatedState.update_history[0].reason).toBe("old_update");
    expect(updatedState.update_history[1].reason).toBe("systematic_meal_bias_detected");
  });

  it("sets baseline_locked to false and model_version to personalized on update", () => {
    const aggregate = {
      sampleCount: 10,
      meanSpeedRatio: 1.5,
      meanTimingDeviationMin: 30,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);
    const { updatedState } = applyMealClassUpdate(baselineState, "mixed", aggregate, decision);

    expect(updatedState.baseline_locked).toBe(false);
    expect(updatedState.model_version).toBe(MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED);
  });

  it("stores the evaluation summary in the state", () => {
    const aggregate = {
      sampleCount: 10,
      excludedCount: 2,
      meanSpeedRatio: 1.5,
      meanTimingDeviationMin: 30,
      meanMagnitudeRatio: 0.8,
      meanMagnitudeDeviationMgdl: 20,
      calibrated: true,
      exclusions: [{ reason: "no_peak_detected", count: 2 }],
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);
    const { updatedState } = applyMealClassUpdate(baselineState, "mixed", aggregate, decision);

    expect(updatedState.evaluation_summary.speedClass).toBe("mixed");
    expect(updatedState.evaluation_summary.sampleCount).toBe(10);
    expect(updatedState.evaluation_summary.meanSpeedRatio).toBe(1.5);
  });

  it("updates only the target class, preserving other class params", () => {
    const stateWithFast = {
      ...baselineState,
      speed_class_parameters: {
        fast: { speed_factor: 0.8, magnitude_factor: 1.0, sample_count: 5 },
      },
    };
    const aggregate = {
      sampleCount: 10,
      meanSpeedRatio: 1.5,
      meanTimingDeviationMin: 30,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(stateWithFast, "mixed", aggregate);
    const { updatedState } = applyMealClassUpdate(stateWithFast, "mixed", aggregate, decision);

    expect(updatedState.speed_class_parameters.fast.speed_factor).toBe(0.8); // preserved
    expect(updatedState.speed_class_parameters.mixed).toBeDefined(); // new
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. Baseline fallback and validation
// ───────────────────────────────────────────────────────────────────────────

describe("8. Baseline fallback and validation", () => {
  it("reverts to baseline when personalized model performs worse", () => {
    const baselineMetrics = { mae: 15, count: 10 };
    const personalizedMetrics = { mae: 25, count: 10 }; // 25 > 15 + 2 = 17
    const validation = validateMealPersonalization(baselineMetrics, personalizedMetrics);

    expect(validation.shouldRevert).toBe(true);
    expect(validation.reason).toBe("personalized_worse_than_baseline");
  });

  it("does not revert when there is insufficient comparison data", () => {
    const validation = validateMealPersonalization(null, { mae: 25, count: 10 });

    expect(validation.shouldRevert).toBe(false);
    expect(validation.reason).toBe("insufficient_comparison_data");
  });

  it("does not revert when personalized samples are below validation threshold", () => {
    const baselineMetrics = { mae: 15, count: 10 };
    const personalizedMetrics = { mae: 25, count: MIN_MEAL_SAMPLES_FOR_VALIDATION - 1 };
    const validation = validateMealPersonalization(baselineMetrics, personalizedMetrics);

    expect(validation.shouldRevert).toBe(false);
    expect(validation.reason).toBe("insufficient_personalized_samples");
  });

  it("does not revert when personalized is within tolerance", () => {
    const baselineMetrics = { mae: 15, count: 10 };
    const personalizedMetrics = { mae: 16, count: 10 }; // 16 <= 15 + 2
    const validation = validateMealPersonalization(baselineMetrics, personalizedMetrics);

    expect(validation.shouldRevert).toBe(false);
    expect(validation.reason).toBe("personalization_validated");
  });

  it("reverts class to baseline_locked=true with factors=1.0", () => {
    const validation = { shouldRevert: true, reason: "personalized_worse_than_baseline" };
    const state = {
      ...baselineState,
      baseline_locked: false,
      speed_class_parameters: {
        mixed: { speed_factor: 1.3, magnitude_factor: 1.2, sample_count: 10 },
      },
    };
    const { updatedState, provenance } = revertMealClassToBaseline(state, "mixed", validation);

    expect(updatedState.baseline_locked).toBe(true);
    expect(updatedState.speed_class_parameters.mixed.speed_factor).toBe(1.0);
    expect(updatedState.speed_class_parameters.mixed.magnitude_factor).toBe(1.0);
    expect(provenance).not.toBeNull();
    expect(provenance.reason).toBe("personalized_worse_than_baseline");
    expect(provenance.model_version).toBe(MEAL_RESPONSE_MODEL_VERSION_BASELINE);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. Model version and parameter resolution
// ───────────────────────────────────────────────────────────────────────────

describe("9. Model version and parameter resolution", () => {
  it("returns baseline version when state is null", () => {
    expect(getMealModelVersion(null)).toBe(MEAL_RESPONSE_MODEL_VERSION_BASELINE);
  });

  it("returns baseline version when baseline_locked is true", () => {
    const state = { ...baselineState, baseline_locked: true };
    expect(getMealModelVersion(state)).toBe(MEAL_RESPONSE_MODEL_VERSION_BASELINE);
  });

  it("returns personalized version when any class has a non-baseline factor", () => {
    const state = {
      ...baselineState,
      baseline_locked: false,
      speed_class_parameters: {
        fast: { speed_factor: 1.0, magnitude_factor: 1.0 },
        mixed: { speed_factor: 1.2, magnitude_factor: 1.0 },
        high_fat: { speed_factor: 1.0, magnitude_factor: 1.0 },
      },
    };
    expect(getMealModelVersion(state)).toBe(MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED);
  });

  it("returns baseline version when all factors are 1.0", () => {
    const state = {
      ...baselineState,
      baseline_locked: false,
      speed_class_parameters: {
        mixed: { speed_factor: 1.0, magnitude_factor: 1.0 },
      },
    };
    expect(getMealModelVersion(state)).toBe(MEAL_RESPONSE_MODEL_VERSION_BASELINE);
  });

  it("resolves null params when state is at baseline", () => {
    expect(resolveMealModelParams(null)).toBe(null);
    expect(resolveMealModelParams({ ...baselineState, baseline_locked: true })).toBe(null);
  });

  it("resolves null params when all factors are 1.0", () => {
    const state = {
      ...baselineState,
      baseline_locked: false,
      speed_class_parameters: {
        mixed: { speed_factor: 1.0, magnitude_factor: 1.0 },
      },
    };
    expect(resolveMealModelParams(state)).toBe(null);
  });

  it("resolves params with personalization when any class has non-baseline factors", () => {
    const state = {
      ...baselineState,
      baseline_locked: false,
      speed_class_parameters: {
        mixed: { speed_factor: 1.2, magnitude_factor: 0.9 },
      },
    };
    const params = resolveMealModelParams(state);

    expect(params).not.toBeNull();
    expect(params.mixed.speedFactor).toBe(1.2);
    expect(params.mixed.magnitudeFactor).toBe(0.9);
  });

  it("preserves all three class params in resolution", () => {
    const state = {
      ...baselineState,
      baseline_locked: false,
      speed_class_parameters: {
        fast: { speed_factor: 0.8, magnitude_factor: 1.0 },
        mixed: { speed_factor: 1.0, magnitude_factor: 1.1 },
        high_fat: { speed_factor: 1.3, magnitude_factor: 0.9 },
      },
    };
    const params = resolveMealModelParams(state);

    expect(params).not.toBeNull();
    expect(params.fast.speedFactor).toBe(0.8);
    expect(params.mixed.magnitudeFactor).toBe(1.1);
    expect(params.high_fat.speedFactor).toBe(1.3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 10. Determinism: same inputs → same outputs
// ───────────────────────────────────────────────────────────────────────────

describe("10. Determinism", () => {
  it("produces identical decisions when called twice with the same inputs", () => {
    const aggregate = {
      sampleCount: 10,
      meanSpeedRatio: 1.5,
      meanTimingDeviationMin: 30,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const d1 = shouldUpdateMealClass(baselineState, "mixed", aggregate);
    const d2 = shouldUpdateMealClass(baselineState, "mixed", aggregate);

    expect(d1).toEqual(d2);
  });

  it("produces identical state updates when called twice with the same inputs", () => {
    const aggregate = {
      sampleCount: 10,
      meanSpeedRatio: 1.5,
      meanTimingDeviationMin: 30,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };
    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);
    const { updatedState: s1 } = applyMealClassUpdate(baselineState, "mixed", aggregate, decision);
    const { updatedState: s2 } = applyMealClassUpdate(baselineState, "mixed", aggregate, decision);

    expect(s1.speed_class_parameters.mixed.speed_factor).toBe(s2.speed_class_parameters.mixed.speed_factor);
    expect(s1.baseline_locked).toBe(s2.baseline_locked);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 11. End-to-end: learn → re-project with learned parameters
// ───────────────────────────────────────────────────────────────────────────

describe("11. End-to-end: learn and verify parameters affect projection", () => {
  it("learns a speed factor from observations and resolves it for projection", () => {
    // Create 6 observations with peak consistently at 90 min (baseline mixed = 60).
    // speedRatio = 90/60 = 1.5 → shrunk = 1 + 0.5*0.7 = 1.35
    const observations = [];
    for (let i = 0; i < 6; i++) {
      observations.push({
        meal_log_id: `meal-${i}`,
        speed_class: "mixed",
        actual_peak_min: 90,
        baseline_peak_min: 60,
        observed_speed_ratio: 1.5,
        actual_rise_mgdl: 40,
        predicted_rise_mgdl: null,
        observed_magnitude_ratio: null,
        calibrated: false,
        carbs: 45,
        excluded: false,
        exclusion_reason: null,
      });
    }

    const aggregate = aggregateMealClassObservations(observations, "mixed");
    expect(aggregate.sampleCount).toBe(6);
    expect(aggregate.meanSpeedRatio).toBeCloseTo(1.5, 2);

    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);
    expect(decision.shouldUpdate).toBe(true);
    // shrunk = 1 + 0.5 * 0.7 = 1.35, within [0.7, 1.45]
    expect(decision.proposedSpeedFactor).toBeCloseTo(1.35, 2);

    const { updatedState } = applyMealClassUpdate(baselineState, "mixed", aggregate, decision);
    expect(updatedState.baseline_locked).toBe(false);
    expect(updatedState.speed_class_parameters.mixed.speed_factor).toBeCloseTo(1.35, 2);

    // Verify the params resolve for projection use.
    const params = resolveMealModelParams(updatedState);
    expect(params).not.toBeNull();
    expect(params.mixed.speedFactor).toBeCloseTo(1.35, 2);
    expect(params.mixed.magnitudeFactor).toBe(1.0);

    // Verify the model version reflects personalization.
    expect(getMealModelVersion(updatedState)).toBe(MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED);
  });

  it("learns a magnitude factor from calibrated observations", () => {
    // 6 observations with magnitude ratio = 0.6 (excursion 40% smaller than predicted)
    const observations = [];
    for (let i = 0; i < 6; i++) {
      observations.push({
        meal_log_id: `meal-${i}`,
        speed_class: "mixed",
        actual_peak_min: 60,
        baseline_peak_min: 60,
        observed_speed_ratio: 1.0,
        actual_rise_mgdl: 60, // predicted = 100 → ratio = 0.6
        predicted_rise_mgdl: 100,
        observed_magnitude_ratio: 0.6,
        calibrated: true,
        carbs: 45,
        excluded: false,
        exclusion_reason: null,
      });
    }

    const aggregate = aggregateMealClassObservations(observations, "mixed");
    expect(aggregate.meanMagnitudeRatio).toBeCloseTo(0.6, 2);
    expect(aggregate.calibrated).toBe(true);

    const decision = shouldUpdateMealClass(baselineState, "mixed", aggregate);
    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedMagnitudeFactor).toBeLessThan(1.0);
    // shrunk = 1 + (-0.4)*0.7 = 0.72
    expect(decision.proposedMagnitudeFactor).toBeCloseTo(0.72, 2);

    const { updatedState } = applyMealClassUpdate(baselineState, "mixed", aggregate, decision);
    const params = resolveMealModelParams(updatedState);
    expect(params.mixed.magnitudeFactor).toBeCloseTo(0.72, 2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 12. User isolation: each user's observations are independent
// ───────────────────────────────────────────────────────────────────────────

describe("12. User isolation", () => {
  it("evaluates each user's observations independently", () => {
    const userAObs = [
      { speed_class: "mixed", observed_speed_ratio: 1.5, excluded: false, observed_magnitude_ratio: null, calibrated: false, actual_rise_mgdl: 40, predicted_rise_mgdl: null },
    ];
    const userBObs = [
      { speed_class: "mixed", observed_speed_ratio: 0.6, excluded: false, observed_magnitude_ratio: null, calibrated: false, actual_rise_mgdl: 40, predicted_rise_mgdl: null },
    ];

    const aggA = aggregateMealClassObservations(userAObs, "mixed");
    const aggB = aggregateMealClassObservations(userBObs, "mixed");

    expect(aggA.meanSpeedRatio).toBe(1.5);
    expect(aggB.meanSpeedRatio).toBe(0.6);
    expect(aggA.meanSpeedRatio).not.toBe(aggB.meanSpeedRatio);
  });

  it("does not let one user's observations affect another user's state", () => {
    const stateA = { ...baselineState };
    const stateB = { ...baselineState };

    const aggregate = {
      sampleCount: 10,
      meanSpeedRatio: 1.5,
      meanTimingDeviationMin: 30,
      meanMagnitudeRatio: null,
      meanMagnitudeDeviationMgdl: null,
      calibrated: false,
    };

    const decision = shouldUpdateMealClass(stateA, "mixed", aggregate);
    const { updatedState: updatedA } = applyMealClassUpdate(stateA, "mixed", aggregate, decision);

    // State B is unchanged.
    expect(stateB.speed_class_parameters).toEqual({});
    expect(updatedA.speed_class_parameters.mixed).toBeDefined();
  });
});