// Stackd Insight Engine — Forecast Evaluation & Guarded Adaptive Learning
// (Milestone 2)
//
// Evaluates saved GlucoseProjection records against actual CGM observations
// after their forecast windows have elapsed. Computes quality metrics (MAE,
// bias, coverage) at defined horizons, and uses guarded adaptive learning to
// update a single model parameter (rateAdjustmentFactor) when sufficient
// evidence supports it.
//
// SCOPE OF THE LEARNED PARAMETER:
//   rateAdjustmentFactor is a single learned correction for systematic
//   prediction bias — nothing more. It cannot distinguish the many causes
//   of prediction error (incorrect absorption timing, wrong absorption
//   magnitude, insulin-action differences, missing readings, activity/stress
//   changes). It is NOT a model of the individual's glucose physiology. It
//   describes what the baseline model tended to get wrong on average; it does
//   not prescribe or recommend any clinical action.
//
// SAFETY: This module never recommends, prescribes, or calculates insulin
// doses. It only adjusts a multiplicative rate factor that shapes future
// glucose projections — never any clinical parameter. The baseline model
// is always retained as the fallback.
//
// Self-contained (no base44:runtime, no npm: imports) so it runs in both the
// backend function runtime and the vitest test environment.

import { BASELINE_MODEL_VERSION, PERSONALIZED_MODEL_VERSION } from "./insightEngine.ts";

const MINUTE_MS = 60 * 1000;

// ── Evaluation identity ─────────────────────────────────────────────────────
export const EVALUATION_VERSION = "2.0.0";

// Horizons at which forecasts are scored (minutes). Must be <= the forecast
// horizon (60 min in Milestone 1) to be scored. 120 is included for future
// longer-horizon forecasts; it is excluded as "beyond_forecast_horizon" when
// the projection's horizon doesn't reach it.
export const EVAL_HORIZONS = [15, 30, 60, 120] as const;

// Matching tolerance: an actual reading within ±N minutes of the target time
// is considered a valid match for that horizon.
export const MATCH_TOLERANCE_MIN = 5;

// Buffer (minutes) that must elapse after a horizon's target time before it
// is eligible for scoring. This lets late-arriving CGM readings land before
// the horizon is evaluated. A horizon is excluded as "buffer_not_elapsed"
// until targetTime + EVAL_BUFFER_MIN has passed. The scheduled evaluator
// (every 15 min) and this buffer work together: the pipeline's projection-
// level filter is a coarse pre-filter, but this per-horizon check is the
// authoritative guarantee that no horizon is scored prematurely.
export const EVAL_BUFFER_MIN = 10;

// ── Learning thresholds ──────────────────────────────────────────────────────
// Minimum number of evaluated forecasts before any parameter update.
export const MIN_SAMPLES_FOR_PERSONALIZATION = 10;

// Minimum mean bias (mg/dL) to justify a parameter update. Below this, the
// model is not systematically wrong enough to correct.
export const MIN_BIAS_FOR_UPDATE_MGDL = 3;

// Reference scale for converting bias to a rate adjustment. A bias of this
// magnitude maps to a full 1.0 → 0.0 (or 2.0) shift before shrinkage.
export const BIAS_REFERENCE_SCALE_MGDL = 40;

// Bayesian-style shrinkage toward baseline (1.0). 0.3 means 30% of the
// observed signal is kept; 70% is pulled back toward baseline. This prevents
// one unusual observation from causing a large parameter shift.
export const SHRINKAGE_LAMBDA = 0.3;

// Safe range for the rate adjustment factor — the learned parameter can never
// push the net rate outside [0.7, 1.3] of the baseline model's prediction.
export const MIN_RATE_FACTOR = 0.7;
export const MAX_RATE_FACTOR = 1.3;

// Minimum change in the rate factor to justify an update (avoids noise).
export const MIN_FACTOR_CHANGE = 0.02;

// Tolerance for the baseline-fallback comparison: if the personalized model's
// MAE exceeds the baseline's by more than this (mg/dL), revert to baseline.
// UNVALIDATED ENGINEERING DEFAULT — not a clinically validated boundary.
// Chosen to require a clear, non-noise improvement before personalization
// is kept; adjust based on observed real-world performance.
export const BASELINE_TOLERANCE_MGDL = 2;

// Minimum personalized projections to validate against baseline.
export const MIN_SAMPLES_FOR_VALIDATION = 5;

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProjectionForEval {
  id?: string;
  user_id?: string;
  generated_at: number;  // epoch ms
  model_version: string;
  horizon_minutes: number;
  trajectory: Array<{
    min_offset: number;
    value: number;
    lower?: number | null;
    upper?: number | null;
  }>;
  abstained: boolean;
}

export interface ReadingForEval {
  time: number;  // epoch ms
  value: number;
  source?: string;
}

export interface HorizonScore {
  horizon_min: number;
  scored: boolean;
  predicted: number | null;
  actual: number | null;
  actual_time: number | null;
  error: number | null;       // predicted - actual (positive = overprediction)
  abs_error: number | null;
  in_interval: boolean | null; // null if no interval available
  match_offset_min: number | null;
  exclusion_reason: string | null;
}

export interface EvaluationResult {
  status: "evaluated" | "unscorable";
  reason: string | null;
  horizons: HorizonScore[];
  mae: number | null;
  bias: number | null;
  coverage: number | null;
  valid_count: number;
  excluded_count: number;
  exclusions: Array<{ horizon_min: number; reason: string }>;
  evaluation_version: string;
  evaluated_at: number;
}

export interface EvaluatedProjection {
  model_version: string;
  evaluation: EvaluationResult;
}

export interface AggregateMetrics {
  sampleCount: number;
  mae: number;
  bias: number;
  coverage: number | null;
  byHorizon: Record<number, { mae: number; bias: number; coverage: number | null; count: number }>;
  byModelVersion: Record<string, { mae: number; bias: number; count: number }>;
}

export interface ModelState {
  model_version: string;
  parameters: {
    rateAdjustmentFactor?: number;
  };
  sample_count: number;
  baseline_locked: boolean;
  evaluation_summary: any;
  last_updated_at?: string;
  update_history?: any[];
}

export interface UpdateDecision {
  shouldUpdate: boolean;
  reason: string;
  proposedFactor?: number;
  observedBias?: number;
  sampleCount?: number;
}

export interface UpdateProvenance {
  timestamp: number;
  previous_params: any;
  new_params: any;
  sample_count: number;
  reason: string;
  model_version: string;
  evaluation_version: string;
  evaluation_summary: any;
}

export interface ValidationDecision {
  shouldRevert: boolean;
  reason: string;
}

// ── Evaluation ──────────────────────────────────────────────────────────────
//
// Metric definitions:
//   MAE  = mean(|predicted - actual|) across scored horizons, in mg/dL.
//   Bias = mean(predicted - actual) across scored horizons, in mg/dL.
//          Positive = systematic overprediction. Negative = underprediction.
//   Coverage = fraction of scored horizons where actual fell within the
//          prediction interval [lower, upper]. Only calculated when ALL
//          scored horizons have a statistically meaningful interval. If any
//          horizon lacks an interval, coverage is null (not calculated).
//
// Matching rules:
//   For each horizon H (15, 30, 60, 120 min), the target time is
//   generated_at + H * 60000. An actual reading within ±MATCH_TOLERANCE_MIN
//   of the target time is a match. The closest reading is used. If no
//   reading falls within the tolerance window, the horizon is excluded with
//   reason "no_observation_in_window".
//
// No future-data leakage:
//   Only readings with time >= generated_at are considered. Readings before
//   the forecast was generated are never used for evaluation.
//
// Minimum sample requirements:
//   A projection is "evaluated" if at least one horizon is scored. It is
//   "unscorable" if zero horizons are scored. Personalization requires at
//   least MIN_SAMPLES_FOR_PERSONALIZATION evaluated projections.

export function evaluateProjection(
  projection: ProjectionForEval,
  actualReadings: ReadingForEval[],
  evalTime: number
): EvaluationResult {
  // Abstained projections have no trajectory to score.
  if (projection.abstained || !projection.trajectory || projection.trajectory.length === 0) {
    return {
      status: "unscorable",
      reason: "abstained_projection",
      horizons: [],
      mae: null, bias: null, coverage: null,
      valid_count: 0, excluded_count: 0,
      exclusions: [],
      evaluation_version: EVALUATION_VERSION,
      evaluated_at: evalTime,
    };
  }

  const generatedAt = projection.generated_at;

  // Only use readings AFTER the forecast was generated (no future-data leakage).
  // Deduplicate and sort chronologically.
  const seen = new Set<string>();
  const validReadings = actualReadings
    .filter(r => r && Number.isFinite(r.time) && Number.isFinite(r.value))
    .filter(r => r.time >= generatedAt)
    .filter(r => {
      const key = `${r.time}|${r.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.time - b.time);

  const horizons: HorizonScore[] = [];

  for (const targetHorizon of EVAL_HORIZONS) {
    if (targetHorizon > projection.horizon_minutes) {
      horizons.push({
        horizon_min: targetHorizon, scored: false,
        predicted: null, actual: null, actual_time: null,
        error: null, abs_error: null, in_interval: null,
        match_offset_min: null,
        exclusion_reason: "beyond_forecast_horizon",
      });
      continue;
    }

    const trajPoint = projection.trajectory.find(p => p.min_offset === targetHorizon);
    if (!trajPoint) {
      horizons.push({
        horizon_min: targetHorizon, scored: false,
        predicted: null, actual: null, actual_time: null,
        error: null, abs_error: null, in_interval: null,
        match_offset_min: null,
        exclusion_reason: "no_prediction_at_horizon",
      });
      continue;
    }

    const predicted = trajPoint.value;
    const targetTime = generatedAt + targetHorizon * MINUTE_MS;
    const toleranceMs = MATCH_TOLERANCE_MIN * MINUTE_MS;

    // Per-horizon buffer: don't score until targetTime + buffer has elapsed.
    // This is the authoritative timing check — the pipeline's projection-level
    // filter is only a coarse pre-filter. No horizon is scored on interpolated
    // or stale data: only actual readings within ±MATCH_TOLERANCE_MIN of the
    // target time are used; missing readings exclude the horizon.
    const bufferMs = EVAL_BUFFER_MIN * MINUTE_MS;
    if (evalTime < targetTime + bufferMs) {
      horizons.push({
        horizon_min: targetHorizon, scored: false,
        predicted, actual: null, actual_time: null,
        error: null, abs_error: null, in_interval: null,
        match_offset_min: null,
        exclusion_reason: "buffer_not_elapsed",
      });
      continue;
    }

    const candidates = validReadings.filter(r =>
      r.time >= targetTime - toleranceMs && r.time <= targetTime + toleranceMs
    );

    if (candidates.length === 0) {
      horizons.push({
        horizon_min: targetHorizon, scored: false,
        predicted, actual: null, actual_time: null,
        error: null, abs_error: null, in_interval: null,
        match_offset_min: null,
        exclusion_reason: "no_observation_in_window",
      });
      continue;
    }

    // Use the closest reading to targetTime.
    const actual = candidates.reduce((closest, r) =>
      Math.abs(r.time - targetTime) < Math.abs(closest.time - targetTime) ? r : closest
    );

    const error = predicted - actual.value;
    const absError = Math.abs(error);

    const hasInterval = trajPoint.lower != null && trajPoint.upper != null;
    const inInterval = hasInterval
      ? (actual.value >= (trajPoint.lower as number) && actual.value <= (trajPoint.upper as number))
      : null;

    horizons.push({
      horizon_min: targetHorizon, scored: true,
      predicted, actual: actual.value, actual_time: actual.time,
      error, abs_error: absError, in_interval: inInterval,
      match_offset_min: Math.round(Math.abs(actual.time - targetTime) / MINUTE_MS * 100) / 100,
      exclusion_reason: null,
    });
  }

  const scoredHorizons = horizons.filter(h => h.scored);
  const validCount = scoredHorizons.length;
  const excludedCount = horizons.length - validCount;

  if (validCount === 0) {
    return {
      status: "unscorable",
      reason: "no_horizons_scored",
      horizons,
      mae: null, bias: null, coverage: null,
      valid_count: 0, excluded_count: excludedCount,
      exclusions: horizons.map(h => ({ horizon_min: h.horizon_min, reason: h.exclusion_reason! })),
      evaluation_version: EVALUATION_VERSION,
      evaluated_at: evalTime,
    };
  }

  const mae = scoredHorizons.reduce((s, h) => s + (h.abs_error as number), 0) / validCount;
  const bias = scoredHorizons.reduce((s, h) => s + (h.error as number), 0) / validCount;

  // Coverage: only if ALL scored horizons have intervals.
  const allHaveIntervals = scoredHorizons.every(h => h.in_interval !== null);
  const coverage = allHaveIntervals
    ? scoredHorizons.filter(h => h.in_interval === true).length / validCount
    : null;

  return {
    status: "evaluated",
    reason: null,
    horizons,
    mae: Math.round(mae * 100) / 100,
    bias: Math.round(bias * 100) / 100,
    coverage: coverage != null ? Math.round(coverage * 1000) / 1000 : null,
    valid_count: validCount,
    excluded_count: excludedCount,
    exclusions: horizons.filter(h => !h.scored).map(h => ({ horizon_min: h.horizon_min, reason: h.exclusion_reason! })),
    evaluation_version: EVALUATION_VERSION,
    evaluated_at: evalTime,
  };
}

// ── Aggregation ────────────────────────────────────────────────────────────

export function aggregateMetrics(evaluated: EvaluatedProjection[]): AggregateMetrics {
  const valid = evaluated.filter(p => p.evaluation && p.evaluation.status === "evaluated");

  if (valid.length === 0) {
    return { sampleCount: 0, mae: 0, bias: 0, coverage: null, byHorizon: {}, byModelVersion: {} };
  }

  const maes = valid.map(p => p.evaluation.mae as number);
  const biases = valid.map(p => p.evaluation.bias as number);
  const mae = maes.reduce((s, v) => s + v, 0) / maes.length;
  const bias = biases.reduce((s, v) => s + v, 0) / biases.length;

  const coverages = valid.map(p => p.evaluation.coverage).filter(c => c != null) as number[];
  const coverage = coverages.length > 0
    ? coverages.reduce((s, v) => s + v, 0) / coverages.length
    : null;

  // By horizon
  const byHorizon: Record<number, { mae: number; bias: number; coverage: number | null; count: number }> = {};
  for (const h of EVAL_HORIZONS) {
    const scores = valid.flatMap(p => p.evaluation.horizons.filter(s => s.horizon_min === h && s.scored));
    if (scores.length === 0) continue;
    const hMae = scores.reduce((s, sc) => s + (sc.abs_error as number), 0) / scores.length;
    const hBias = scores.reduce((s, sc) => s + (sc.error as number), 0) / scores.length;
    const hCoverages = scores.map(sc => sc.in_interval).filter(c => c != null) as boolean[];
    const hCoverage = hCoverages.length > 0
      ? hCoverages.filter(c => c === true).length / hCoverages.length
      : null;
    byHorizon[h] = {
      mae: Math.round(hMae * 100) / 100,
      bias: Math.round(hBias * 100) / 100,
      coverage: hCoverage != null ? Math.round(hCoverage * 1000) / 1000 : null,
      count: scores.length,
    };
  }

  // By model version
  const byModelVersion: Record<string, { mae: number; bias: number; count: number }> = {};
  for (const p of valid) {
    const mv = p.model_version;
    if (!byModelVersion[mv]) byModelVersion[mv] = { mae: 0, bias: 0, count: 0 };
    byModelVersion[mv].mae += (p.evaluation.mae as number);
    byModelVersion[mv].bias += (p.evaluation.bias as number);
    byModelVersion[mv].count++;
  }
  for (const mv of Object.keys(byModelVersion)) {
    const c = byModelVersion[mv].count;
    byModelVersion[mv].mae = Math.round((byModelVersion[mv].mae / c) * 100) / 100;
    byModelVersion[mv].bias = Math.round((byModelVersion[mv].bias / c) * 100) / 100;
  }

  return {
    sampleCount: valid.length,
    mae: Math.round(mae * 100) / 100,
    bias: Math.round(bias * 100) / 100,
    coverage: coverage != null ? Math.round(coverage * 1000) / 1000 : null,
    byHorizon,
    byModelVersion,
  };
}

// ── Guarded adaptive learning ──────────────────────────────────────────────
//
// The learned parameter is `rateAdjustmentFactor` — a single learned
// correction for systematic prediction bias. It is a multiplicative factor
// applied to the net glucose rate (carbRise - insulinDrop + momentum) in the
// projection engine. Baseline = 1.0. If the model systematically overpredicts
// (positive bias), the factor decreases below 1.0 to slow the projected
// change. If it underpredicts (negative bias), the factor increases above 1.0.
//
// This parameter CANNOT distinguish the many causes of prediction error
// (absorption timing, absorption magnitude, insulin action, missing
// readings, activity/stress). It is not a model of the individual's glucose
// physiology — it is a single bias correction, nothing more. It describes
// what the baseline tended to get wrong on average; it never prescribes.
//
// Guards:
//   1. Minimum sample count (MIN_SAMPLES_FOR_PERSONALIZATION = 10).
//   2. Minimum bias magnitude (MIN_BIAS_FOR_UPDATE_MGDL = 3 mg/dL).
//   3. Shrinkage toward baseline (SHRINKAGE_LAMBDA = 0.3 — only 30% of the
//      observed signal is kept; 70% is pulled back to 1.0).
//   4. Clamping to [0.7, 1.3] — the factor can never push the net rate outside
//      70%-130% of the baseline model's prediction.
//   5. Minimum factor change (MIN_FACTOR_CHANGE = 0.02 — avoids noise).
//   6. Validation: if the personalized model's MAE exceeds the baseline's by
//      more than BASELINE_TOLERANCE_MGDL, revert to baseline.

export function shouldUpdateModel(state: ModelState, metrics: AggregateMetrics): UpdateDecision {
  if (metrics.sampleCount < MIN_SAMPLES_FOR_PERSONALIZATION) {
    return { shouldUpdate: false, reason: "insufficient_samples", sampleCount: metrics.sampleCount };
  }

  const meanBias = metrics.bias;

  if (Math.abs(meanBias) < MIN_BIAS_FOR_UPDATE_MGDL) {
    return { shouldUpdate: false, reason: "bias_below_threshold", observedBias: meanBias };
  }

  // Compute the observed adjustment factor.
  // Positive bias (overprediction) → decrease the rate factor.
  // Negative bias (underprediction) → increase the rate factor.
  const observedFactor = 1.0 - (meanBias / BIAS_REFERENCE_SCALE_MGDL);

  // Shrinkage toward baseline (1.0).
  const proposedFactor = 1.0 + (observedFactor - 1.0) * (1 - SHRINKAGE_LAMBDA);

  // Clamp to safe range.
  const clampedFactor = Math.max(MIN_RATE_FACTOR, Math.min(MAX_RATE_FACTOR, proposedFactor));

  const currentFactor = Number(state.parameters?.rateAdjustmentFactor) || 1.0;

  if (Math.abs(clampedFactor - currentFactor) < MIN_FACTOR_CHANGE) {
    return { shouldUpdate: false, reason: "change_below_threshold", proposedFactor: clampedFactor, observedBias: meanBias };
  }

  return {
    shouldUpdate: true,
    reason: "systematic_bias_detected",
    proposedFactor: clampedFactor,
    observedBias: meanBias,
    sampleCount: metrics.sampleCount,
  };
}

export function applyGuardedUpdate(
  state: ModelState,
  metrics: AggregateMetrics,
  decision: UpdateDecision
): { updatedState: ModelState; provenance: UpdateProvenance | null } {
  if (!decision.shouldUpdate) {
    return { updatedState: state, provenance: null };
  }

  const previousParams = { ...state.parameters };
  const newParams = {
    ...state.parameters,
    rateAdjustmentFactor: decision.proposedFactor,
  };

  const now = Date.now();
  const evaluationSummary = {
    mae: metrics.mae,
    bias: metrics.bias,
    coverage: metrics.coverage,
    byHorizon: metrics.byHorizon,
    byModelVersion: metrics.byModelVersion,
  };

  const updatedState: ModelState = {
    model_version: PERSONALIZED_MODEL_VERSION,
    parameters: newParams,
    sample_count: metrics.sampleCount,
    baseline_locked: false,
    evaluation_summary: evaluationSummary,
    last_updated_at: new Date(now).toISOString(),
    update_history: [
      ...(state.update_history || []),
      {
        timestamp: now,
        previous_params: previousParams,
        new_params: newParams,
        sample_count: metrics.sampleCount,
        reason: decision.reason,
        model_version: PERSONALIZED_MODEL_VERSION,
        evaluation_version: EVALUATION_VERSION,
        evaluation_summary: evaluationSummary,
      },
    ],
  };

  const provenance: UpdateProvenance = {
    timestamp: now,
    previous_params: previousParams,
    new_params: newParams,
    sample_count: metrics.sampleCount,
    reason: decision.reason,
    model_version: PERSONALIZED_MODEL_VERSION,
    evaluation_version: EVALUATION_VERSION,
    evaluation_summary: evaluationSummary,
  };

  return { updatedState, provenance };
}

// ── Baseline comparison ────────────────────────────────────────────────────
//
// FAIR COMPARISON: Both the baseline and personalized models are evaluated
// against the same eligible observations using identical rules — the same
// horizons (EVAL_HORIZONS), the same matching tolerance
// (MATCH_TOLERANCE_MIN), the same buffer (EVAL_BUFFER_MIN), and the same
// exclusion criteria. No filter favors one model with easier observations.
//
// LIMITATION: Because the engine generates one projection per call using
// whichever model state is active, baseline and personalized projections
// cover different time periods. The comparison is between the baseline era
// and the personalized era, not a controlled A/B test on the same moments.
// If conditions differ systematically between eras (e.g. more meals in one),
// the comparison may be confounded. This is inherent to the sequential
// design and should be considered when interpreting the result.
export function validatePersonalization(metrics: AggregateMetrics): ValidationDecision {
  const baselineMetrics = metrics.byModelVersion[BASELINE_MODEL_VERSION];
  const personalizedMetrics = metrics.byModelVersion[PERSONALIZED_MODEL_VERSION];

  if (!baselineMetrics || !personalizedMetrics) {
    return { shouldRevert: false, reason: "insufficient_comparison_data" };
  }

  if (personalizedMetrics.count < MIN_SAMPLES_FOR_VALIDATION) {
    return { shouldRevert: false, reason: "insufficient_personalized_samples" };
  }

  if (personalizedMetrics.mae > baselineMetrics.mae + BASELINE_TOLERANCE_MGDL) {
    return { shouldRevert: true, reason: "personalized_worse_than_baseline" };
  }

  return { shouldRevert: false, reason: "personalization_validated" };
}

export function revertToBaseline(
  state: ModelState,
  metrics: AggregateMetrics,
  validation: ValidationDecision
): { updatedState: ModelState; provenance: UpdateProvenance | null } {
  if (!validation.shouldRevert) {
    return { updatedState: state, provenance: null };
  }

  const previousParams = { ...state.parameters };
  const newParams = {
    ...state.parameters,
    rateAdjustmentFactor: 1.0,
  };

  const now = Date.now();
  const evaluationSummary = {
    mae: metrics.mae,
    bias: metrics.bias,
    coverage: metrics.coverage,
    byHorizon: metrics.byHorizon,
    byModelVersion: metrics.byModelVersion,
  };

  const updatedState: ModelState = {
    model_version: BASELINE_MODEL_VERSION,
    parameters: newParams,
    sample_count: metrics.sampleCount,
    baseline_locked: true,
    evaluation_summary: evaluationSummary,
    last_updated_at: new Date(now).toISOString(),
    update_history: [
      ...(state.update_history || []),
      {
        timestamp: now,
        previous_params: previousParams,
        new_params: newParams,
        sample_count: metrics.sampleCount,
        reason: validation.reason,
        model_version: BASELINE_MODEL_VERSION,
        evaluation_version: EVALUATION_VERSION,
        evaluation_summary: evaluationSummary,
      },
    ],
  };

  const provenance: UpdateProvenance = {
    timestamp: now,
    previous_params: previousParams,
    new_params: newParams,
    sample_count: metrics.sampleCount,
    reason: validation.reason,
    model_version: BASELINE_MODEL_VERSION,
    evaluation_version: EVALUATION_VERSION,
    evaluation_summary: evaluationSummary,
  };

  return { updatedState, provenance };
}