// Stackd Insight Engine — Forecast Evaluation & Guarded Adaptive Learning
// (Milestone 2) — Frontend/testable reference implementation
//
// This is the JavaScript mirror of base44/shared/forecastEvaluation.ts. Both
// implement the same algorithm and must be kept in sync. Tests run against
// this file; the backend function imports the TypeScript version.
//
// SAFETY: Never recommends, prescribes, or calculates insulin doses. Only
// adjusts a multiplicative rate factor. Baseline is always the fallback.

import { BASELINE_MODEL_VERSION, PERSONALIZED_MODEL_VERSION } from "./index";

const MINUTE_MS = 60 * 1000;

// ── Evaluation identity ─────────────────────────────────────────────────────
export const EVALUATION_VERSION = "2.0.0";
export const EVAL_HORIZONS = [15, 30, 60, 120];
export const MATCH_TOLERANCE_MIN = 5;

// ── Learning thresholds ──────────────────────────────────────────────────────
export const MIN_SAMPLES_FOR_PERSONALIZATION = 10;
export const MIN_BIAS_FOR_UPDATE_MGDL = 3;
export const BIAS_REFERENCE_SCALE_MGDL = 40;
export const SHRINKAGE_LAMBDA = 0.3;
export const MIN_RATE_FACTOR = 0.7;
export const MAX_RATE_FACTOR = 1.3;
export const MIN_FACTOR_CHANGE = 0.02;
export const BASELINE_TOLERANCE_MGDL = 2;
export const MIN_SAMPLES_FOR_VALIDATION = 5;

// ── Evaluation ──────────────────────────────────────────────────────────────

export function evaluateProjection(projection, actualReadings, evalTime) {
  if (projection.abstained || !projection.trajectory || projection.trajectory.length === 0) {
    return {
      status: "unscorable", reason: "abstained_projection",
      horizons: [], mae: null, bias: null, coverage: null,
      valid_count: 0, excluded_count: 0, exclusions: [],
      evaluation_version: EVALUATION_VERSION, evaluated_at: evalTime,
    };
  }

  const generatedAt = projection.generated_at;

  // Only use readings AFTER the forecast was generated (no future-data leakage).
  // Deduplicate and sort chronologically.
  const seen = new Set();
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

  const horizons = [];

  for (const targetHorizon of EVAL_HORIZONS) {
    if (targetHorizon > projection.horizon_minutes) {
      horizons.push({
        horizon_min: targetHorizon, scored: false,
        predicted: null, actual: null, actual_time: null,
        error: null, abs_error: null, in_interval: null,
        match_offset_min: null, exclusion_reason: "beyond_forecast_horizon",
      });
      continue;
    }

    const trajPoint = projection.trajectory.find(p => p.min_offset === targetHorizon);
    if (!trajPoint) {
      horizons.push({
        horizon_min: targetHorizon, scored: false,
        predicted: null, actual: null, actual_time: null,
        error: null, abs_error: null, in_interval: null,
        match_offset_min: null, exclusion_reason: "no_prediction_at_horizon",
      });
      continue;
    }

    const predicted = trajPoint.value;
    const targetTime = generatedAt + targetHorizon * MINUTE_MS;
    const toleranceMs = MATCH_TOLERANCE_MIN * MINUTE_MS;

    const candidates = validReadings.filter(r =>
      r.time >= targetTime - toleranceMs && r.time <= targetTime + toleranceMs
    );

    if (candidates.length === 0) {
      horizons.push({
        horizon_min: targetHorizon, scored: false,
        predicted, actual: null, actual_time: null,
        error: null, abs_error: null, in_interval: null,
        match_offset_min: null, exclusion_reason: "no_observation_in_window",
      });
      continue;
    }

    const actual = candidates.reduce((closest, r) =>
      Math.abs(r.time - targetTime) < Math.abs(closest.time - targetTime) ? r : closest
    );

    const error = predicted - actual.value;
    const absError = Math.abs(error);

    const hasInterval = trajPoint.lower != null && trajPoint.upper != null;
    const inInterval = hasInterval
      ? (actual.value >= trajPoint.lower && actual.value <= trajPoint.upper)
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
      status: "unscorable", reason: "no_horizons_scored",
      horizons, mae: null, bias: null, coverage: null,
      valid_count: 0, excluded_count: excludedCount,
      exclusions: horizons.map(h => ({ horizon_min: h.horizon_min, reason: h.exclusion_reason })),
      evaluation_version: EVALUATION_VERSION, evaluated_at: evalTime,
    };
  }

  const mae = scoredHorizons.reduce((s, h) => s + h.abs_error, 0) / validCount;
  const bias = scoredHorizons.reduce((s, h) => s + h.error, 0) / validCount;

  const allHaveIntervals = scoredHorizons.every(h => h.in_interval !== null);
  const coverage = allHaveIntervals
    ? scoredHorizons.filter(h => h.in_interval === true).length / validCount
    : null;

  return {
    status: "evaluated", reason: null,
    horizons,
    mae: Math.round(mae * 100) / 100,
    bias: Math.round(bias * 100) / 100,
    coverage: coverage != null ? Math.round(coverage * 1000) / 1000 : null,
    valid_count: validCount, excluded_count: excludedCount,
    exclusions: horizons.filter(h => !h.scored).map(h => ({ horizon_min: h.horizon_min, reason: h.exclusion_reason })),
    evaluation_version: EVALUATION_VERSION, evaluated_at: evalTime,
  };
}

// ── Aggregation ────────────────────────────────────────────────────────────

export function aggregateMetrics(evaluated) {
  const valid = evaluated.filter(p => p.evaluation && p.evaluation.status === "evaluated");

  if (valid.length === 0) {
    return { sampleCount: 0, mae: 0, bias: 0, coverage: null, byHorizon: {}, byModelVersion: {} };
  }

  const maes = valid.map(p => p.evaluation.mae);
  const biases = valid.map(p => p.evaluation.bias);
  const mae = maes.reduce((s, v) => s + v, 0) / maes.length;
  const bias = biases.reduce((s, v) => s + v, 0) / biases.length;

  const coverages = valid.map(p => p.evaluation.coverage).filter(c => c != null);
  const coverage = coverages.length > 0
    ? coverages.reduce((s, v) => s + v, 0) / coverages.length
    : null;

  const byHorizon = {};
  for (const h of EVAL_HORIZONS) {
    const scores = valid.flatMap(p => p.evaluation.horizons.filter(s => s.horizon_min === h && s.scored));
    if (scores.length === 0) continue;
    const hMae = scores.reduce((s, sc) => s + sc.abs_error, 0) / scores.length;
    const hBias = scores.reduce((s, sc) => s + sc.error, 0) / scores.length;
    const hCoverages = scores.map(sc => sc.in_interval).filter(c => c != null);
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

  const byModelVersion = {};
  for (const p of valid) {
    const mv = p.model_version;
    if (!byModelVersion[mv]) byModelVersion[mv] = { mae: 0, bias: 0, count: 0 };
    byModelVersion[mv].mae += p.evaluation.mae;
    byModelVersion[mv].bias += p.evaluation.bias;
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
    byHorizon, byModelVersion,
  };
}

// ── Guarded adaptive learning ──────────────────────────────────────────────

export function shouldUpdateModel(state, metrics) {
  if (metrics.sampleCount < MIN_SAMPLES_FOR_PERSONALIZATION) {
    return { shouldUpdate: false, reason: "insufficient_samples", sampleCount: metrics.sampleCount };
  }

  const meanBias = metrics.bias;

  if (Math.abs(meanBias) < MIN_BIAS_FOR_UPDATE_MGDL) {
    return { shouldUpdate: false, reason: "bias_below_threshold", observedBias: meanBias };
  }

  const observedFactor = 1.0 - (meanBias / BIAS_REFERENCE_SCALE_MGDL);
  const proposedFactor = 1.0 + (observedFactor - 1.0) * (1 - SHRINKAGE_LAMBDA);
  const clampedFactor = Math.max(MIN_RATE_FACTOR, Math.min(MAX_RATE_FACTOR, proposedFactor));

  const currentFactor = Number(state.parameters?.rateAdjustmentFactor) || 1.0;

  if (Math.abs(clampedFactor - currentFactor) < MIN_FACTOR_CHANGE) {
    return { shouldUpdate: false, reason: "change_below_threshold", proposedFactor: clampedFactor, observedBias: meanBias };
  }

  return {
    shouldUpdate: true, reason: "systematic_bias_detected",
    proposedFactor: clampedFactor, observedBias: meanBias, sampleCount: metrics.sampleCount,
  };
}

export function applyGuardedUpdate(state, metrics, decision) {
  if (!decision.shouldUpdate) {
    return { updatedState: state, provenance: null };
  }

  const previousParams = { ...state.parameters };
  const newParams = { ...state.parameters, rateAdjustmentFactor: decision.proposedFactor };

  const now = Date.now();
  const evaluationSummary = {
    mae: metrics.mae, bias: metrics.bias, coverage: metrics.coverage,
    byHorizon: metrics.byHorizon, byModelVersion: metrics.byModelVersion,
  };

  const updatedState = {
    model_version: PERSONALIZED_MODEL_VERSION,
    parameters: newParams,
    sample_count: metrics.sampleCount,
    baseline_locked: false,
    evaluation_summary: evaluationSummary,
    last_updated_at: new Date(now).toISOString(),
    update_history: [
      ...(state.update_history || []),
      {
        timestamp: now, previous_params: previousParams, new_params: newParams,
        sample_count: metrics.sampleCount, reason: decision.reason,
        model_version: PERSONALIZED_MODEL_VERSION,
        evaluation_version: EVALUATION_VERSION,
        evaluation_summary: evaluationSummary,
      },
    ],
  };

  const provenance = {
    timestamp: now, previous_params: previousParams, new_params: newParams,
    sample_count: metrics.sampleCount, reason: decision.reason,
    model_version: PERSONALIZED_MODEL_VERSION,
    evaluation_version: EVALUATION_VERSION,
    evaluation_summary: evaluationSummary,
  };

  return { updatedState, provenance };
}

export function validatePersonalization(metrics) {
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

export function revertToBaseline(state, metrics, validation) {
  if (!validation.shouldRevert) {
    return { updatedState: state, provenance: null };
  }

  const previousParams = { ...state.parameters };
  const newParams = { ...state.parameters, rateAdjustmentFactor: 1.0 };

  const now = Date.now();
  const evaluationSummary = {
    mae: metrics.mae, bias: metrics.bias, coverage: metrics.coverage,
    byHorizon: metrics.byHorizon, byModelVersion: metrics.byModelVersion,
  };

  const updatedState = {
    model_version: BASELINE_MODEL_VERSION,
    parameters: newParams,
    sample_count: metrics.sampleCount,
    baseline_locked: true,
    evaluation_summary: evaluationSummary,
    last_updated_at: new Date(now).toISOString(),
    update_history: [
      ...(state.update_history || []),
      {
        timestamp: now, previous_params: previousParams, new_params: newParams,
        sample_count: metrics.sampleCount, reason: validation.reason,
        model_version: BASELINE_MODEL_VERSION,
        evaluation_version: EVALUATION_VERSION,
        evaluation_summary: evaluationSummary,
      },
    ],
  };

  const provenance = {
    timestamp: now, previous_params: previousParams, new_params: newParams,
    sample_count: metrics.sampleCount, reason: validation.reason,
    model_version: BASELINE_MODEL_VERSION,
    evaluation_version: EVALUATION_VERSION,
    evaluation_summary: evaluationSummary,
  };

  return { updatedState, provenance };
}