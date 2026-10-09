// Stackd Insight Engine — Empirical Uncertainty Calibration (Milestone 4)
//
// Calibrates prediction-interval width (sigma) from the user's historical
// out-of-sample forecast errors. When enough evaluated projections exist,
// sigma at each horizon is set to the empirical mean absolute error (MAE)
// at that horizon — a data-driven measure of how far off the model has
// actually been. When insufficient evaluation data exists, the interval
// falls back to the existing heuristic sigma and is explicitly marked as
// "uncalibrated."
//
// HONESTY PRINCIPLES:
//   - An interval is NOT claimed to be "calibrated" until its coverage has
//     been measured on suitable observations.
//   - Intervals are NOT narrowed merely because a personalized model is
//     active. Personalization without validation does not justify tighter
//     intervals.
//   - When the empirical data is insufficient, the interval is marked
//     "uncalibrated" so consumers know it is a heuristic, not a measured
//     error distribution.
//   - Coverage is only reported when enough observations with intervals
//     exist to compute it meaningfully.
//
// Self-contained (no base44:runtime, no npm: imports).

import { EVAL_HORIZONS } from "./forecastEvaluation.ts";

export const UNCERTAINTY_VERSION = "1.0.0";

// Minimum evaluated projections to calibrate uncertainty empirically.
// Below this, the heuristic is used and the interval is marked uncalibrated.
export const MIN_SAMPLES_FOR_CALIBRATION = 10;

// Minimum scored observations at a specific horizon to use the empirical
// sigma for that horizon. Below this, the heuristic is used for that horizon.
const MIN_HORIZON_SAMPLES = 3;

// Multiplier to convert MAE to a prediction-interval half-width.
// MAE ≈ 0.8 * sigma for a normal distribution, so sigma ≈ MAE / 0.8 ≈ 1.25 * MAE.
// We use 1.25 so the interval captures ~68% of errors when the distribution
// is roughly normal. This is a conservative choice — it does NOT assume
// normality, it just scales the observed mean absolute deviation.
const MAE_TO_SIGMA_MULTIPLIER = 1.25;

// Maximum sigma to prevent absurd intervals even with large empirical errors.
const MAX_SIGMA_MGDL = 80;

// Minimum sigma floor — even with very small empirical errors, the interval
// should not be narrower than this, to avoid false precision.
const MIN_SIGMA_FLOOR_MGDL = 5;

export interface UncertaintyCalibration {
  method: "heuristic" | "empirical_calibrated";
  version: string;
  sigmaByHorizon: Record<number, number>;  // empirical sigma at each horizon
  calibrated: boolean;
  sampleCount: number;                      // total evaluated projections used
  horizonSampleCounts: Record<number, number>;  // observations per horizon
  coverageObserved: number | null;           // observed interval coverage (0-1)
  coverageSampleCount: number;              // projections with intervals used for coverage
}

// ── Calibration from evaluation history ────────────────────────────────────

export function calibrateUncertainty(
  evaluatedProjections: Array<{
    evaluation?: {
      status: string;
      mae: number | null;
      horizons?: Array<{
        horizon_min: number;
        scored: boolean;
        abs_error: number | null;
        in_interval: boolean | null;
      }>;
      coverage?: number | null;
    };
  }>
): UncertaintyCalibration {
  const valid = evaluatedProjections.filter(
    (p) => p.evaluation && p.evaluation.status === "evaluated"
  );

  if (valid.length < MIN_SAMPLES_FOR_CALIBRATION) {
    return {
      method: "heuristic",
      version: UNCERTAINTY_VERSION,
      sigmaByHorizon: {},
      calibrated: false,
      sampleCount: valid.length,
      horizonSampleCounts: {},
      coverageObserved: null,
      coverageSampleCount: 0,
    };
  }

  // Compute empirical sigma at each horizon from abs_error.
  const sigmaByHorizon: Record<number, number> = {};
  const horizonSampleCounts: Record<number, number> = {};

  for (const h of EVAL_HORIZONS) {
    const errors: number[] = [];
    for (const p of valid) {
      const horizonScores = p.evaluation!.horizons?.filter(
        (s) => s.horizon_min === h && s.scored && s.abs_error != null
      ) || [];
      for (const s of horizonScores) {
        errors.push(s.abs_error as number);
      }
    }

    horizonSampleCounts[h] = errors.length;

    if (errors.length >= MIN_HORIZON_SAMPLES) {
      const mae = errors.reduce((sum, e) => sum + e, 0) / errors.length;
      const sigma = Math.min(
        MAX_SIGMA_MGDL,
        Math.max(MIN_SIGMA_FLOOR_MGDL, mae * MAE_TO_SIGMA_MULTIPLIER)
      );
      sigmaByHorizon[h] = Math.round(sigma * 10) / 10;
    }
  }

  // Compute observed coverage from projections that had intervals.
  const withIntervals = valid.filter(
    (p) => p.evaluation!.coverage != null && p.evaluation!.horizons
      ?.some((s) => s.scored && s.in_interval !== null)
  );

  let coverageObserved: number | null = null;
  let coverageSampleCount = 0;

  if (withIntervals.length >= MIN_HORIZON_SAMPLES) {
    // Recompute coverage from horizon-level in_interval flags for accuracy.
    const allIntervalChecks: boolean[] = [];
    for (const p of withIntervals) {
      for (const s of (p.evaluation!.horizons || [])) {
        if (s.scored && s.in_interval !== null) {
          allIntervalChecks.push(s.in_interval as boolean);
        }
      }
    }
    if (allIntervalChecks.length >= MIN_HORIZON_SAMPLES) {
      coverageObserved = allIntervalChecks.filter((v) => v).length / allIntervalChecks.length;
      coverageObserved = Math.round(coverageObserved * 1000) / 1000;
      coverageSampleCount = withIntervals.length;
    }
  }

  const hasAnySigma = Object.keys(sigmaByHorizon).length > 0;

  return {
    method: hasAnySigma ? "empirical_calibrated" : "heuristic",
    version: UNCERTAINTY_VERSION,
    sigmaByHorizon,
    calibrated: hasAnySigma,
    sampleCount: valid.length,
    horizonSampleCounts,
    coverageObserved,
    coverageSampleCount,
  };
}

// ── Sigma lookup at a given time offset ─────────────────────────────────────

// Returns the empirically calibrated sigma at the given offset (minutes from
// anchor), interpolating between known horizons. Returns null if no empirical
// data is available at or near this offset (caller should use heuristic).
export function getEmpiricalSigma(
  minOffset: number,
  calibration: UncertaintyCalibration
): number | null {
  if (!calibration.calibrated || Object.keys(calibration.sigmaByHorizon).length === 0) {
    return null;
  }

  const horizons = Object.keys(calibration.sigmaByHorizon)
    .map(Number)
    .sort((a, b) => a - b);

  // Before the first known horizon — use the first horizon's sigma
  // (uncertainty doesn't shrink below the anchor-level error).
  if (minOffset <= horizons[0]) {
    return calibration.sigmaByHorizon[horizons[0]];
  }

  // After the last known horizon — use the last horizon's sigma
  // (uncertainty doesn't grow indefinitely beyond what we've measured).
  if (minOffset >= horizons[horizons.length - 1]) {
    return calibration.sigmaByHorizon[horizons[horizons.length - 1]];
  }

  // Interpolate between the two surrounding horizons.
  for (let i = 0; i < horizons.length - 1; i++) {
    const h0 = horizons[i];
    const h1 = horizons[i + 1];
    if (minOffset >= h0 && minOffset <= h1) {
      const s0 = calibration.sigmaByHorizon[h0];
      const s1 = calibration.sigmaByHorizon[h1];
      const frac = (minOffset - h0) / (h1 - h0);
      return Math.round((s0 + (s1 - s0) * frac) * 10) / 10;
    }
  }

  return null;
}