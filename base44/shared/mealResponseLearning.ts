// Stackd Insight Engine — Personalized Meal Absorption Learning (Milestone 3)
//
// A guarded, adaptive meal-response learning system that learns from a user's
// historical meal logs and subsequent CGM observations to improve the
// meal-related component of future glucose projections.
//
// LEARNED PARAMETERS (per speed class: fast / mixed / high_fat):
//   speedFactor     — multiplicative adjustment to absorption TIMING. Scales
//                     the peak time and window duration. <1 = faster peak,
//                     >1 = slower peak. Baseline = 1.0. Clamped [0.7, 1.45].
//   magnitudeFactor — multiplicative adjustment to the glucose EXCURSION
//                     magnitude per gram of carbs. <1 = smaller excursion,
//                     >1 = larger excursion. Baseline = 1.0. Clamped [0.7, 1.3].
//
// These two parameters are SEPARATE:
//   - speedFactor corrects WHEN carbs hit the bloodstream (timing).
//   - magnitudeFactor corrects HOW MUCH glucose rise they produce (magnitude).
//   - The general rateAdjustmentFactor (Milestone 2) corrects the OVERALL net
//     rate (carb rise - insulin drop + momentum) and cannot distinguish
//     meal-specific causes.
//
// SCOPE OF THE LEARNED PARAMETERS:
//   These are EMPIRICAL meal-response parameters derived from the user's
//   observed CGM responses to meals — NOT direct measurements of carbohydrate
//   absorption physiology. CGM trajectories also reflect insulin action,
//   activity, stress, and other influences that the model cannot fully
//   separate. The learned values describe what the baseline meal-response
//   model tended to get wrong for this user's meals of a given class; they
//   do NOT prescribe or recommend any clinical action, and they do NOT
//   modify the user's insulin regimen.
//
// SAFETY: Never recommends, prescribes, or calculates insulin doses. Only
// adjusts multiplicative factors that shape the estimated meal-response
// component of a glucose projection. Baseline is always retained as the
// fallback when evidence is insufficient or personalization underperforms.
//
// Self-contained (no base44:runtime, no npm: imports) so it runs in both the
// backend function runtime and the vitest test environment.

import {
  BASELINE_CLASS_PARAMS,
  getCarbSpeedClass,
  type SpeedClass,
  MINUTE_MS,
} from "./carbAbsorptionProfile.ts";
import {
  MEAL_RESPONSE_MODEL_VERSION_BASELINE,
  MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED,
} from "./insightEngine.ts";

// ── Model identity ──────────────────────────────────────────────────────────
export const MEAL_EVALUATION_VERSION = "1.0.0";

// ── Learning thresholds ──────────────────────────────────────────────────────
// Minimum number of distinct valid meal observations for a class before any
// parameter update. Each meal is ONE sample (not each CGM reading).
// Rationale: meal responses are noisy; a single meal's peak timing can vary
// by 20+ min due to factors the model can't see. 5 distinct meals give enough
// signal to detect a systematic timing bias without overfitting to one meal.
export const MIN_MEAL_SAMPLES_FOR_LEARNING = 5;

// Minimum personalized projections with active meals to validate against
// baseline. Lower than the general model because meal-containing projections
// are a subset of all projections.
export const MIN_MEAL_SAMPLES_FOR_VALIDATION = 3;

// Minimum timing deviation (minutes) between the observed mean peak time and
// the baseline predicted peak time to justify a speedFactor update. Below
// this, the class's timing is not systematically wrong enough to correct.
export const MIN_TIMING_DEVIATION_MIN = 10;

// Minimum magnitude deviation (mg/dL) between the observed mean excursion and
// the baseline predicted excursion to justify a magnitudeFactor update.
export const MIN_MAGNITUDE_DEVIATION_MGDL = 10;

// Bayesian-style shrinkage toward baseline (1.0). 0.3 means 30% of the
// observed signal is kept; 70% is pulled back toward baseline. This prevents
// one unusual meal from causing a large parameter shift.
export const MEAL_SHRINKAGE_LAMBDA = 0.3;

// Safe ranges for the learned factors.
export const MIN_MEAL_SPEED_FACTOR = 0.7;
export const MAX_MEAL_SPEED_FACTOR = 1.45;
export const MIN_MEAL_MAGNITUDE_FACTOR = 0.7;
export const MAX_MEAL_MAGNITUDE_FACTOR = 1.3;

// Minimum change in a factor to justify an update (avoids noise).
export const MIN_MEAL_FACTOR_CHANGE = 0.05;

// Tolerance for the baseline-fallback comparison: if the personalized model's
// MAE on meal-containing projections exceeds the baseline's by more than
// this (mg/dL), revert that class to baseline.
// UNVALIDATED ENGINEERING DEFAULT — not a clinically validated boundary.
export const MEAL_BASELINE_TOLERANCE_MGDL = 2;

// Outlier rejection bounds. Observations outside these ranges are excluded
// as unreliable, not counted toward the sample threshold.
export const MIN_VALID_PEAK_MIN = 5;
export const MAX_VALID_PEAK_MIN = 360;
export const MIN_SPEED_RATIO = 0.3;
export const MAX_SPEED_RATIO = 2.5;
export const MIN_MAGNITUDE_RATIO = 0.2;
export const MAX_MAGNITUDE_RATIO = 3.0;
export const MIN_VALID_RISE_MGDL = 5;

// Conservative fallback when user hasn't set ISF / I:C. Must match the
// projection engine's UNCALIBRATED_MG_PER_GRAM.
const UNCALIBRATED_MG_PER_GRAM = 3.0;

// Confounders that make a meal observation unreliable for learning. The
// glucose excursion cannot be confidently attributed to the meal when any of
// these are present. "high_protein_fat" is NOT a confounder — it's a meal
// characteristic that determines the speed class.
const EXCLUDE_CONFOUNDERS = new Set([
  "overlapping_meal",
  "rescue_carbs",
  "multiple_corrections",
  "missing_glucose_data",
  "active_insulin_at_start",
  "already_rising",
  "already_falling",
]);

// ── Types ──────────────────────────────────────────────────────────────────

export interface MealTrainingObservation {
  meal_log_id: string;
  speed_class: SpeedClass;
  actual_peak_min: number;
  baseline_peak_min: number;
  observed_speed_ratio: number;
  actual_rise_mgdl: number;
  predicted_rise_mgdl: number | null;
  observed_magnitude_ratio: number | null;
  calibrated: boolean;
  carbs: number;
  excluded: boolean;
  exclusion_reason: string | null;
}

export interface MealClassAggregate {
  speedClass: SpeedClass;
  sampleCount: number;
  excludedCount: number;
  meanSpeedRatio: number;
  meanMagnitudeRatio: number | null;
  calibrated: boolean;
  meanTimingDeviationMin: number;
  meanMagnitudeDeviationMgdl: number | null;
  exclusions: Array<{ reason: string; count: number }>;
}

export interface MealModelState {
  model_version: string;
  speed_class_parameters: {
    fast?: MealClassParams;
    mixed?: MealClassParams;
    high_fat?: MealClassParams;
    [key: string]: MealClassParams | undefined;
  };
  sample_counts_by_class: {
    fast?: number;
    mixed?: number;
    high_fat?: number;
  };
  evaluation_summary: any;
  last_updated_at?: string;
  baseline_locked: boolean;
  update_history: any[];
}

export interface MealClassParams {
  speed_factor: number;
  magnitude_factor: number;
  sample_count: number;
}

export interface MealUpdateDecision {
  shouldUpdate: boolean;
  reason: string;
  speedClass: SpeedClass;
  proposedSpeedFactor?: number;
  proposedMagnitudeFactor?: number | null;
  sampleCount?: number;
}

export interface MealUpdateProvenance {
  timestamp: number;
  speed_class: SpeedClass;
  previous_params: MealClassParams | null;
  new_params: MealClassParams;
  sample_count: number;
  reason: string;
  model_version: string;
  evaluation_version: string;
  evaluation_summary: any;
}

export interface MealValidationDecision {
  shouldRevert: boolean;
  reason: string;
  speedClass?: SpeedClass;
}

export interface MealModelParams {
  [key: string]: {
    speedFactor: number;
    magnitudeFactor: number;
  };
}

// ── Training observation construction ──────────────────────────────────────
//
// Builds ONE training observation from a completed MealResponseAnalysis and
// its corresponding CarbEntry. One meal = one observation (not one CGM
// reading = one observation). Multiple CGM readings from the same meal are
// already aggregated into the MealResponseAnalysis's peak/rise metrics.
//
// Exclusion rules:
//   - Confounders in EXCLUDE_CONFOUNDERS (overlapping meals, rescue carbs,
//     multiple corrections, missing data, active insulin, already rising/falling)
//   - No peak detected (peak_time is null)
//   - No starting glucose (starting_glucose is null)
//   - No meaningful rise (maximum_glucose_rise <= 0)
//   - Unreasonable peak timing (< 5 or > 360 min)
//   - Outlier speed ratio (< 0.3 or > 2.5)
//   - Outlier magnitude ratio (< 0.2 or > 3.0) — only when calibrated
//
// No interpolation: if the MealResponseAnalysis couldn't detect a peak or
// starting glucose, the observation is excluded, not fabricated.

export function buildMealTrainingObservation(
  analysis: any,
  mealEntry: any,
  settings: any
): MealTrainingObservation {
  const mealLogId = analysis?.meal_log_id || mealEntry?.id || "";
  const speedClass = getCarbSpeedClass(mealEntry || analysis);
  const baseline = BASELINE_CLASS_PARAMS[speedClass];
  const baselinePeakMin = baseline.peakMin;

  const carbs = Number(analysis?.carbs_logged ?? mealEntry?.carbs) || 0;

  // ISF and I:C ratio for predicting the glucose rise.
  const isf = Number(settings?.insulin_sensitivity_mgdl_per_unit);
  const unitsPer5g = Number(settings?.meal_insulin_units_per_5g);
  const calibrated = Number.isFinite(isf) && isf > 0 && Number.isFinite(unitsPer5g) && unitsPer5g > 0;
  const mgPerGram = calibrated ? isf * (unitsPer5g / 5) : UNCALIBRATED_MG_PER_GRAM;

  // Actual peak timing.
  const mealTimeStr = analysis?.meal_time;
  const peakTimeStr = analysis?.peak_time;
  let actualPeakMin: number | null = null;
  if (mealTimeStr && peakTimeStr) {
    const mealTime = new Date(mealTimeStr).getTime();
    const peakTime = new Date(peakTimeStr).getTime();
    if (Number.isFinite(mealTime) && Number.isFinite(peakTime) && peakTime >= mealTime) {
      actualPeakMin = Math.round((peakTime - mealTime) / MINUTE_MS);
    }
  }

  // Actual glucose rise.
  const actualRiseMgdl = Number(analysis?.maximum_glucose_rise) || 0;

  // Predicted rise (mg/dL) = carbs * mgPerGram.
  const predictedRiseMgdl = carbs > 0 ? carbs * mgPerGram : null;

  // Observed ratios.
  const observedSpeedRatio = actualPeakMin != null && baselinePeakMin > 0
    ? actualPeakMin / baselinePeakMin
    : null;

  const observedMagnitudeRatio = (calibrated && predictedRiseMgdl != null && predictedRiseMgdl > 0 && actualRiseMgdl > 0)
    ? actualRiseMgdl / predictedRiseMgdl
    : null;

  // ── Exclusion checks ──────────────────────────────────────────────────
  const confounders: string[] = Array.isArray(analysis?.confounding_events)
    ? analysis.confounding_events
    : [];

  // Check for excluding confounders.
  const excludingConfounders = confounders.filter((c) => EXCLUDE_CONFOUNDERS.has(c));

  let excluded = false;
  let exclusionReason: string | null = null;

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
//
// Groups valid observations by speed class and computes aggregate statistics.
// One meal = one sample. Excluded observations are counted but do not
// contribute to the aggregate statistics.

export function aggregateMealClassObservations(
  observations: MealTrainingObservation[],
  speedClass: SpeedClass
): MealClassAggregate {
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

  // Magnitude ratio only when calibrated and all valid observations have it.
  const magnitudeRatios = valid
    .map((o) => o.observed_magnitude_ratio)
    .filter((r): r is number => r != null && Number.isFinite(r) && r > 0);

  const calibrated = valid.some((o) => o.calibrated);
  const meanMagnitudeRatio = magnitudeRatios.length > 0
    ? magnitudeRatios.reduce((s, v) => s + v, 0) / magnitudeRatios.length
    : null;

  // Mean magnitude deviation in mg/dL (only when calibrated).
  let meanMagnitudeDeviationMgdl: number | null = null;
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

function countExclusions(excluded: MealTrainingObservation[]): Array<{ reason: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const o of excluded) {
    const reason = o.exclusion_reason || "unknown";
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return Object.entries(counts).map(([reason, count]) => ({ reason, count }));
}

// ── Guarded adaptive learning ──────────────────────────────────────────────
//
// For each speed class, decides whether to update the learned parameters
// based on the aggregate statistics. Guards:
//   1. Minimum sample count (MIN_MEAL_SAMPLES_FOR_LEARNING = 5).
//   2. Minimum timing deviation (MIN_TIMING_DEVIATION_MIN = 10 min).
//   3. Minimum magnitude deviation (MIN_MAGNITUDE_DEVIATION_MGDL = 10 mg/dL),
//      only when calibrated.
//   4. Shrinkage toward baseline (MEAL_SHRINKAGE_LAMBDA = 0.3).
//   5. Clamping to safe ranges.
//   6. Minimum factor change (MIN_MEAL_FACTOR_CHANGE = 0.05).
//
// speedFactor and magnitudeFactor are updated INDEPENDENTLY: a class can have
// a learned speedFactor without a learned magnitudeFactor (e.g., timing is
// off but magnitude is fine), and vice versa.

export function shouldUpdateMealClass(
  state: MealModelState,
  speedClass: SpeedClass,
  aggregate: MealClassAggregate
): MealUpdateDecision {
  if (aggregate.sampleCount < MIN_MEAL_SAMPLES_FOR_LEARNING) {
    return {
      shouldUpdate: false,
      reason: "insufficient_samples",
      speedClass,
      sampleCount: aggregate.sampleCount,
    };
  }

  const currentParams = state.speed_class_parameters?.[speedClass] || null;
  const currentSpeedFactor = Number(currentParams?.speed_factor) || 1.0;
  const currentMagnitudeFactor = Number(currentParams?.magnitude_factor) || 1.0;

  // ── Speed factor decision ──
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

  // ── Magnitude factor decision (only when calibrated) ──
  let proposedMagnitudeFactor: number | null = currentMagnitudeFactor;
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
    return {
      shouldUpdate: false,
      reason: "change_below_threshold",
      speedClass,
      sampleCount: aggregate.sampleCount,
    };
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

export function applyMealClassUpdate(
  state: MealModelState,
  speedClass: SpeedClass,
  aggregate: MealClassAggregate,
  decision: MealUpdateDecision
): { updatedState: MealModelState; provenance: MealUpdateProvenance | null } {
  if (!decision.shouldUpdate) {
    return { updatedState: state, provenance: null };
  }

  const previousParams = state.speed_class_parameters?.[speedClass] || null;
  const newParams: MealClassParams = {
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

  const updatedState: MealModelState = {
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

  const provenance: MealUpdateProvenance = {
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
//
// FAIR COMPARISON: Both the baseline and personalized meal-response models
// are evaluated against the same eligible CGM observations using identical
// rules — the same horizons, matching tolerance, buffer, and exclusion
// criteria as the general forecast evaluation (Milestone 2). No filter
// favors one model with easier observations.
//
// LIMITATION: Because the engine generates one projection per call using
// whichever meal-response model state is active, baseline and personalized
// meal-response projections cover different time periods. The comparison is
// between the baseline era and the personalized era, not a controlled A/B
// test on the same moments. This is the same inherent limitation as the
// general forecast model (Milestone 2) and should be considered when
// interpreting the result.
//
// Additionally, the total glucose forecast error CANNOT isolate the
// meal-response component: the forecast includes carb + insulin + momentum
// contributions. A difference in MAE between baseline and personalized
// meal-response models may reflect changes in the user's overall glucose
// management between eras, not just the meal-response parameter change.
// This is documented honestly and the tolerance is conservative.

export function validateMealPersonalization(
  baselineMetrics: { mae: number; count: number } | null,
  personalizedMetrics: { mae: number; count: number } | null
): MealValidationDecision {
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

export function revertMealClassToBaseline(
  state: MealModelState,
  speedClass: SpeedClass,
  validation: MealValidationDecision
): { updatedState: MealModelState; provenance: MealUpdateProvenance | null } {
  if (!validation.shouldRevert) {
    return { updatedState: state, provenance: null };
  }

  const previousParams = state.speed_class_parameters?.[speedClass] || null;
  const newParams: MealClassParams = {
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

  const updatedState: MealModelState = {
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

  const provenance: MealUpdateProvenance = {
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
//
// Resolves the effective meal-response model version and parameters from the
// user's MealResponseModelState. Returns null params when the state is at
// baseline (no personalization applied). The projection engine uses these
// to adjust the meal-related trajectory.

export function getMealModelVersion(state: MealModelState | null): string {
  if (!state || state.baseline_locked) return MEAL_RESPONSE_MODEL_VERSION_BASELINE;
  const params = state.speed_class_parameters;
  if (!params) return MEAL_RESPONSE_MODEL_VERSION_BASELINE;

  for (const cls of ["fast", "mixed", "high_fat"] as SpeedClass[]) {
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

export function resolveMealModelParams(state: MealModelState | null): MealModelParams | null {
  if (!state || state.baseline_locked) return null;
  const params = state.speed_class_parameters;
  if (!params) return null;

  const result: MealModelParams = {};
  let hasPersonalization = false;

  for (const cls of ["fast", "mixed", "high_fat"] as SpeedClass[]) {
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