// Stackd Insight Engine — Personalized Meal Absorption Learning (Milestone 3)
// Frontend/testable JavaScript mirror of base44/shared/mealResponseLearning.ts.
// Both implement the same algorithm and must be kept in sync. Tests run
// against this file; the backend function imports the TypeScript version.
//
// SAFETY: Never recommends, prescribes, or calculates insulin doses. Only
// adjusts multiplicative factors that shape the estimated meal-response
// component of a glucose projection. Baseline is always the fallback.
//
// SCOPE OF THE LEARNED PARAMETERS:
//   speedFactor and magnitudeFactor are EMPIRICAL meal-response parameters
//   derived from the user's observed CGM responses — NOT direct measurements
//   of carbohydrate absorption physiology. They describe what the baseline
//   model tended to get wrong for this user's meals of a given class; they
//   do not prescribe or recommend any clinical action.

import {
  MEAL_RESPONSE_MODEL_VERSION_BASELINE,
  MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED,
} from "./index";

const MINUTE_MS = 60 * 1000;

// Speed-class derivation and baseline params — mirrors base44/shared/carbAbsorptionProfile.ts
// so the frontend learning module is self-contained for testing.
const BASELINE_CLASS_PARAMS = {
  fast: { peakMin: 30, windowMin: 120, secPeakMin: null },
  mixed: { peakMin: 60, windowMin: 210, secPeakMin: null },
  high_fat: { peakMin: 40, windowMin: 300, secPeakMin: 120 },
};

function getCarbSpeedClass(entry) {
  const fat = Number(entry?.fat_grams ?? entry?.fat ?? 0) || 0;
  const protein = Number(entry?.protein_grams ?? entry?.protein ?? 0) || 0;
  const carbs = Number(entry?.carbs ?? 0) || 0;
  const gi = Number(entry?.glycemic_index ?? entry?.gi ?? 0) || 0;
  const profile = entry?.absorption_profile || "medium";
  if (fat >= 40 || (protein >= 30 && carbs > 0) || (protein >= 75 && carbs === 0)) return "high_fat";
  if (profile === "fast" || gi >= 70) return "fast";
  return "mixed";
}

// ── Model identity ──────────────────────────────────────────────────────────
export const MEAL_EVALUATION_VERSION = "1.0.0";

// ── Learning thresholds ──────────────────────────────────────────────────────
export const MIN_MEAL_SAMPLES_FOR_LEARNING = 5;
export const MIN_MEAL_SAMPLES_FOR_VALIDATION = 3;
export const MIN_TIMING_DEVIATION_MIN = 10;
export const MIN_MAGNITUDE_DEVIATION_MGDL = 10;
export const MEAL_SHRINKAGE_LAMBDA = 0.3;
export const MIN_MEAL_SPEED_FACTOR = 0.7;
export const MAX_MEAL_SPEED_FACTOR = 1.45;
export const MIN_MEAL_MAGNITUDE_FACTOR = 0.7;
export const MAX_MEAL_MAGNITUDE_FACTOR = 1.3;
export const MIN_MEAL_FACTOR_CHANGE = 0.05;
export const MEAL_BASELINE_TOLERANCE_MGDL = 2;

export const MIN_VALID_PEAK_MIN = 5;
export const MAX_VALID_PEAK_MIN = 360;
export const MIN_SPEED_RATIO = 0.3;
export const MAX_SPEED_RATIO = 2.5;
export const MIN_MAGNITUDE_RATIO = 0.2;
export const MAX_MAGNITUDE_RATIO = 3.0;
export const MIN_VALID_RISE_MGDL = 5;

const UNCALIBRATED_MG_PER_GRAM = 3.0;

const EXCLUDE_CONFOUNDERS = new Set([
  "overlapping_meal",
  "rescue_carbs",
  "multiple_corrections",
  "missing_glucose_data",
  "active_insulin_at_start",
  "already_rising",
  "already_falling",
]);

// ── Training observation construction ──────────────────────────────────────

export function buildMealTrainingObservation(analysis, mealEntry, settings) {
  const mealLogId = analysis?.meal_log_id || mealEntry?.id || "";
  const speedClass = getCarbSpeedClass(mealEntry || analysis);
  const baseline = BASELINE_CLASS_PARAMS[speedClass];
  const baselinePeakMin = baseline.peakMin;

  const carbs = Number(analysis?.carbs_logged ?? mealEntry?.carbs) || 0;

  const isf = Number(settings?.insulin_sensitivity_mgdl_per_unit);
  const unitsPer5g = Number(settings?.meal_insulin_units_per_5g);
  const calibrated = Number.isFinite(isf) && isf > 0 && Number.isFinite(unitsPer5g) && unitsPer5g > 0;
  const mgPerGram = calibrated ? isf * (unitsPer5g / 5) : UNCALIBRATED_MG_PER_GRAM;

  const mealTimeStr = analysis?.meal_time;
  const peakTimeStr = analysis?.peak_time;
  let actualPeakMin = null;
  if (mealTimeStr && peakTimeStr) {
    const mealTime = new Date(mealTimeStr).getTime();
    const peakTime = new Date(peakTimeStr).getTime();
    if (Number.isFinite(mealTime) && Number.isFinite(peakTime) && peakTime >= mealTime) {
      actualPeakMin = Math.round((peakTime - mealTime) / MINUTE_MS);
    }
  }

  const actualRiseMgdl = Number(analysis?.maximum_glucose_rise) || 0;
  const predictedRiseMgdl = carbs > 0 ? carbs * mgPerGram : null;

  const observedSpeedRatio = actualPeakMin != null && baselinePeakMin > 0
    ? actualPeakMin / baselinePeakMin
    : null;

  const observedMagnitudeRatio = (calibrated && predictedRiseMgdl != null && predictedRiseMgdl > 0 && actualRiseMgdl > 0)
    ? actualRiseMgdl / predictedRiseMgdl
    : null;

  const confounders = Array.isArray(analysis?.confounding_events) ? analysis.confounding_events : [];
  const excludingConfounders = confounders.filter((c) => EXCLUDE_CONFOUNDERS.has(c));

  let excluded = false;
  let exclusionReason = null;

  if (excludingConfounders.length > 0) {
    excluded = true;
    exclusionReason = `confounder:${excludingConfounders[0]}`;
  } else if (actualPeakMin == null) {
    excluded = true;
    exclusionReason = "no_peak_detected";
  } else if (analysis?.starting_glucose == null) {
    excluded = true;
    exclusionReason = "no_starting_glucose";
  } else if (actualRiseMgdl < MIN_VALID_RISE_MGDL) {
    excluded = true;
    exclusionReason = "rise_below_minimum";
  } else if (actualPeakMin < MIN_VALID_PEAK_MIN || actualPeakMin > MAX_VALID_PEAK_MIN) {
    excluded = true;
    exclusionReason = "peak_timing_out_of_range";
  } else if (observedSpeedRatio != null && (observedSpeedRatio < MIN_SPEED_RATIO || observedSpeedRatio > MAX_SPEED_RATIO)) {
    excluded = true;
    exclusionReason = "speed_ratio_outlier";
  } else if (observedMagnitudeRatio != null && (observedMagnitudeRatio < MIN_MAGNITUDE_RATIO || observedMagnitudeRatio > MAX_MAGNITUDE_RATIO)) {
    excluded = true;
    exclusionReason = "magnitude_ratio_outlier";
  }

  return {
    meal_log_id: mealLogId,
    speed_class: speedClass,
    actual_peak_min: actualPeakMin ?? 0,
    baseline_peak_min: baselinePeakMin,
    observed_speed_ratio: observedSpeedRatio ?? 0,
    actual_rise_mgdl: actualRiseMgdl,
    predicted_rise_mgdl: predictedRiseMgdl,
    observed_magnitude_ratio: observedMagnitudeRatio,
    calibrated,
    carbs,
    excluded,
    exclusion_reason: exclusionReason,
  };
}

// ── Aggregation ────────────────────────────────────────────────────────────

function countExclusions(excluded) {
  const counts = {};
  for (const o of excluded) {
    const reason = o.exclusion_reason || "unknown";
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return Object.entries(counts).map(([reason, count]) => ({ reason, count }));
}

export function aggregateMealClassObservations(observations, speedClass) {
  const classObs = observations.filter((o) => o.speed_class === speedClass);
  const valid = classObs.filter((o) => !o.excluded && o.observed_speed_ratio > 0);
  const excluded = classObs.filter((o) => o.excluded);

  if (valid.length === 0) {
    return {
      speedClass,
      sampleCount: 0,
      excludedCount: excluded.length,
      meanSpeedRatio: 1.0,
      meanMagnitudeRatio: null,
      calibrated: false,
      meanTimingDeviationMin: 0,
      meanMagnitudeDeviationMgdl: null,
      exclusions: countExclusions(excluded),
    };
  }

  const speedRatios = valid.map((o) => o.observed_speed_ratio);
  const meanSpeedRatio = speedRatios.reduce((s, v) => s + v, 0) / speedRatios.length;

  const baselinePeakMin = BASELINE_CLASS_PARAMS[speedClass].peakMin;
  const meanTimingDeviationMin = Math.abs(meanSpeedRatio - 1.0) * baselinePeakMin;

  const magnitudeRatios = valid
    .map((o) => o.observed_magnitude_ratio)
    .filter((r) => r != null && Number.isFinite(r) && r > 0);

  const calibrated = valid.some((o) => o.calibrated);
  const meanMagnitudeRatio = magnitudeRatios.length > 0
    ? magnitudeRatios.reduce((s, v) => s + v, 0) / magnitudeRatios.length
    : null;

  let meanMagnitudeDeviationMgdl = null;
  if (meanMagnitudeRatio != null) {
    const rises = valid
      .filter((o) => o.observed_magnitude_ratio != null)
      .map((o) => Math.abs(o.actual_rise_mgdl - (o.predicted_rise_mgdl ?? 0)));
    if (rises.length > 0) {
      meanMagnitudeDeviationMgdl = rises.reduce((s, v) => s + v, 0) / rises.length;
    }
  }

  return {
    speedClass,
    sampleCount: valid.length,
    excludedCount: excluded.length,
    meanSpeedRatio: Math.round(meanSpeedRatio * 1000) / 1000,
    meanMagnitudeRatio: meanMagnitudeRatio != null ? Math.round(meanMagnitudeRatio * 1000) / 1000 : null,
    calibrated,
    meanTimingDeviationMin: Math.round(meanTimingDeviationMin * 10) / 10,
    meanMagnitudeDeviationMgdl: meanMagnitudeDeviationMgdl != null ? Math.round(meanMagnitudeDeviationMgdl * 10) / 10 : null,
    exclusions: countExclusions(excluded),
  };
}

// ── Guarded adaptive learning ──────────────────────────────────────────────

export function shouldUpdateMealClass(state, speedClass, aggregate) {
  if (aggregate.sampleCount < MIN_MEAL_SAMPLES_FOR_LEARNING) {
    return { shouldUpdate: false, reason: "insufficient_samples", speedClass, sampleCount: aggregate.sampleCount };
  }

  const currentParams = state.speed_class_parameters?.[speedClass] || null;
  const currentSpeedFactor = Number(currentParams?.speed_factor) || 1.0;
  const currentMagnitudeFactor = Number(currentParams?.magnitude_factor) || 1.0;

  let proposedSpeedFactor = currentSpeedFactor;
  let speedUpdateNeeded = false;

  if (aggregate.meanTimingDeviationMin >= MIN_TIMING_DEVIATION_MIN) {
    const observedSpeedRatio = aggregate.meanSpeedRatio;
    const shrunkSpeed = 1.0 + (observedSpeedRatio - 1.0) * (1 - MEAL_SHRINKAGE_LAMBDA);
    const clampedSpeed = Math.max(MIN_MEAL_SPEED_FACTOR, Math.min(MAX_MEAL_SPEED_FACTOR, shrunkSpeed));
    if (Math.abs(clampedSpeed - currentSpeedFactor) >= MIN_MEAL_FACTOR_CHANGE) {
      proposedSpeedFactor = clampedSpeed;
      speedUpdateNeeded = true;
    }
  }

  let proposedMagnitudeFactor = currentMagnitudeFactor;
  let magnitudeUpdateNeeded = false;

  if (
    aggregate.calibrated &&
    aggregate.meanMagnitudeRatio != null &&
    aggregate.meanMagnitudeDeviationMgdl != null &&
    aggregate.meanMagnitudeDeviationMgdl >= MIN_MAGNITUDE_DEVIATION_MGDL
  ) {
    const observedMagRatio = aggregate.meanMagnitudeRatio;
    const shrunkMag = 1.0 + (observedMagRatio - 1.0) * (1 - MEAL_SHRINKAGE_LAMBDA);
    const clampedMag = Math.max(MIN_MEAL_MAGNITUDE_FACTOR, Math.min(MAX_MEAL_MAGNITUDE_FACTOR, shrunkMag));
    if (Math.abs(clampedMag - currentMagnitudeFactor) >= MIN_MEAL_FACTOR_CHANGE) {
      proposedMagnitudeFactor = clampedMag;
      magnitudeUpdateNeeded = true;
    }
  }

  if (!speedUpdateNeeded && !magnitudeUpdateNeeded) {
    return { shouldUpdate: false, reason: "change_below_threshold", speedClass, sampleCount: aggregate.sampleCount };
  }

  return {
    shouldUpdate: true,
    reason: "systematic_meal_bias_detected",
    speedClass,
    proposedSpeedFactor,
    proposedMagnitudeFactor,
    sampleCount: aggregate.sampleCount,
  };
}

export function applyMealClassUpdate(state, speedClass, aggregate, decision) {
  if (!decision.shouldUpdate) {
    return { updatedState: state, provenance: null };
  }

  const previousParams = state.speed_class_parameters?.[speedClass] || null;
  const newParams = {
    speed_factor: decision.proposedSpeedFactor ?? previousParams?.speed_factor ?? 1.0,
    magnitude_factor: decision.proposedMagnitudeFactor ?? previousParams?.magnitude_factor ?? 1.0,
    sample_count: aggregate.sampleCount,
  };

  const now = Date.now();
  const evaluationSummary = {
    speedClass,
    sampleCount: aggregate.sampleCount,
    excludedCount: aggregate.excludedCount,
    meanSpeedRatio: aggregate.meanSpeedRatio,
    meanMagnitudeRatio: aggregate.meanMagnitudeRatio,
    meanTimingDeviationMin: aggregate.meanTimingDeviationMin,
    meanMagnitudeDeviationMgdl: aggregate.meanMagnitudeDeviationMgdl,
    exclusions: aggregate.exclusions,
  };

  const updatedState = {
    ...state,
    model_version: MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED,
    speed_class_parameters: {
      ...state.speed_class_parameters,
      [speedClass]: newParams,
    },
    sample_counts_by_class: {
      ...state.sample_counts_by_class,
      [speedClass]: aggregate.sampleCount,
    },
    baseline_locked: false,
    evaluation_summary: evaluationSummary,
    last_updated_at: new Date(now).toISOString(),
    update_history: [
      ...(state.update_history || []),
      {
        timestamp: now,
        speed_class: speedClass,
        previous_params: previousParams,
        new_params: newParams,
        sample_count: aggregate.sampleCount,
        reason: decision.reason,
        model_version: MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED,
        evaluation_version: MEAL_EVALUATION_VERSION,
        evaluation_summary: evaluationSummary,
      },
    ],
  };

  const provenance = {
    timestamp: now,
    speed_class: speedClass,
    previous_params: previousParams,
    new_params: newParams,
    sample_count: aggregate.sampleCount,
    reason: decision.reason,
    model_version: MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED,
    evaluation_version: MEAL_EVALUATION_VERSION,
    evaluation_summary: evaluationSummary,
  };

  return { updatedState, provenance };
}

// ── Baseline validation and reversion ──────────────────────────────────────

export function validateMealPersonalization(baselineMetrics, personalizedMetrics) {
  if (!baselineMetrics || !personalizedMetrics) {
    return { shouldRevert: false, reason: "insufficient_comparison_data" };
  }

  if (personalizedMetrics.count < MIN_MEAL_SAMPLES_FOR_VALIDATION) {
    return { shouldRevert: false, reason: "insufficient_personalized_samples" };
  }

  if (personalizedMetrics.mae > baselineMetrics.mae + MEAL_BASELINE_TOLERANCE_MGDL) {
    return { shouldRevert: true, reason: "personalized_worse_than_baseline" };
  }

  return { shouldRevert: false, reason: "personalization_validated" };
}

export function revertMealClassToBaseline(state, speedClass, validation) {
  if (!validation.shouldRevert) {
    return { updatedState: state, provenance: null };
  }

  const previousParams = state.speed_class_parameters?.[speedClass] || null;
  const newParams = {
    speed_factor: 1.0,
    magnitude_factor: 1.0,
    sample_count: previousParams?.sample_count ?? 0,
  };

  const now = Date.now();
  const evaluationSummary = {
    speedClass,
    reason: validation.reason,
    previous_params: previousParams,
  };

  const updatedState = {
    ...state,
    speed_class_parameters: {
      ...state.speed_class_parameters,
      [speedClass]: newParams,
    },
    baseline_locked: true,
    last_updated_at: new Date(now).toISOString(),
    update_history: [
      ...(state.update_history || []),
      {
        timestamp: now,
        speed_class: speedClass,
        previous_params: previousParams,
        new_params: newParams,
        sample_count: newParams.sample_count,
        reason: validation.reason,
        model_version: MEAL_RESPONSE_MODEL_VERSION_BASELINE,
        evaluation_version: MEAL_EVALUATION_VERSION,
        evaluation_summary: evaluationSummary,
      },
    ],
  };

  const provenance = {
    timestamp: now,
    speed_class: speedClass,
    previous_params: previousParams,
    new_params: newParams,
    sample_count: newParams.sample_count,
    reason: validation.reason,
    model_version: MEAL_RESPONSE_MODEL_VERSION_BASELINE,
    evaluation_version: MEAL_EVALUATION_VERSION,
    evaluation_summary: evaluationSummary,
  };

  return { updatedState, provenance };
}

// ── Model version and parameter resolution ──────────────────────────────────

export function getMealModelVersion(state) {
  if (!state || state.baseline_locked) return MEAL_RESPONSE_MODEL_VERSION_BASELINE;
  const params = state.speed_class_parameters;
  if (!params) return MEAL_RESPONSE_MODEL_VERSION_BASELINE;

  for (const cls of ["fast", "mixed", "high_fat"]) {
    const cp = params[cls];
    if (cp) {
      const sf = Number(cp.speed_factor);
      const mf = Number(cp.magnitude_factor);
      if (Number.isFinite(sf) && Math.abs(sf - 1.0) > 0.001) return MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED;
      if (Number.isFinite(mf) && Math.abs(mf - 1.0) > 0.001) return MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED;
    }
  }
  return MEAL_RESPONSE_MODEL_VERSION_BASELINE;
}

export function resolveMealModelParams(state) {
  if (!state || state.baseline_locked) return null;
  const params = state.speed_class_parameters;
  if (!params) return null;

  const result = {};
  let hasPersonalization = false;

  for (const cls of ["fast", "mixed", "high_fat"]) {
    const cp = params[cls];
    if (!cp) continue;
    const sf = Number(cp.speed_factor);
    const mf = Number(cp.magnitude_factor);
    const speedFactor = Number.isFinite(sf) && sf > 0 ? sf : 1.0;
    const magnitudeFactor = Number.isFinite(mf) && mf > 0 ? mf : 1.0;
    if (Math.abs(speedFactor - 1.0) > 0.001 || Math.abs(magnitudeFactor - 1.0) > 0.001) {
      hasPersonalization = true;
    }
    result[cls] = { speedFactor, magnitudeFactor };
  }

  return hasPersonalization ? result : null;
}