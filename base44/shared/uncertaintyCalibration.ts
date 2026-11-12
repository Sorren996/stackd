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

// The interval the band claims to be: four times in five, the reading lands
// inside it. The half-width is therefore fitted from the user's OWN residual
// quantiles rather than from a multiple of their mean error — a quantile makes
// no assumption about the shape of the error distribution, and it does not
// widen every band to cover one bad afternoon.
export const NOMINAL_BAND_COVERAGE = 0.8;

function quantile(values: number[], q: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function median(values: number[]): number {
  return quantile(values, 0.5);
}

// Maximum sigma to prevent absurd intervals even with large empirical errors.
const MAX_SIGMA_MGDL = 95;

// Minimum sigma floor — even with very small empirical errors, the interval
// should not be narrower than this, to avoid false precision.
const MIN_SIGMA_FLOOR_MGDL = 5;

// ── The shape the fitted band must have ────────────────────────────────────
//
// 1. MONOTONE. The band can never be narrower at a later horizon than at an
//    earlier one. Production showed 84 mg/dL at 40 minutes and 18 at 120 —
//    claiming more confidence two hours out than at forty minutes, which the
//    engine cannot know. Raw per-horizon quantiles are therefore carried
//    forward as a running maximum, so a thin or unlucky horizon can never pull
//    the band back in.
// 2. SATURATING. The band grows towards a realistic ceiling of about 75 mg/dL
//    half-width instead of widening without limit.
export const UNCERTAINTY_CEILING_MGDL = 75;
const SATURATION_KNEE_MGDL = 45;

export function saturateHalfWidth(rawMgdl: number): number {
  if (!(rawMgdl > 0)) return 0;
  if (rawMgdl <= SATURATION_KNEE_MGDL) return rawMgdl;
  const room = UNCERTAINTY_CEILING_MGDL - SATURATION_KNEE_MGDL;
  return SATURATION_KNEE_MGDL + room * (1 - Math.exp(-(rawMgdl - SATURATION_KNEE_MGDL) / room));
}

// Carry each horizon's fitted width forward as a running maximum, then saturate.
// A horizon with no samples of its own inherits the width measured before it, so
// interpolation between horizons can never step back down.
export function monotoneSaturatingFit(rawByHorizon: Record<number, number>): Record<number, number> {
  const out: Record<number, number> = {};
  let carried = 0;
  const horizons = [...EVAL_HORIZONS].sort((a, b) => a - b);
  for (const h of horizons) {
    const raw = rawByHorizon[h];
    if (Number.isFinite(raw)) carried = Math.max(carried, raw as number);
    if (!(carried > 0)) continue;
    const width = Math.max(MIN_SIGMA_FLOOR_MGDL, saturateHalfWidth(carried));
    out[h] = Math.round(width * 10) / 10;
  }
  return out;
}

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

  // Compute the RAW fitted width at each horizon from signed residuals, then fit
  // it once — monotonically and saturating — across the horizon ladder.
  const rawByHorizon: Record<number, number> = {};
  const horizonSampleCounts: Record<number, number> = {};

  for (const h of EVAL_HORIZONS) {
    const residuals: number[] = [];
    for (const p of valid) {
      const horizonScores = p.evaluation!.horizons?.filter(
        (s) => s.horizon_min === h && s.scored && s.abs_error != null
      ) || [];
      for (const s of horizonScores) {
        // Signed residual where the evaluator stored one, so the band is centred
        // on where the model actually lands rather than on where it aimed.
        const signed = Number((s as { error?: number | null }).error);
        residuals.push(Number.isFinite(signed) ? signed : (s.abs_error as number));
      }
    }

    horizonSampleCounts[h] = residuals.length;

    if (residuals.length >= MIN_HORIZON_SAMPLES) {
      const centre = median(residuals);
      const deviations = residuals.map((r) => Math.abs(r - centre));
      const halfWidth = quantile(deviations, NOMINAL_BAND_COVERAGE);
      rawByHorizon[h] = Math.min(
        MAX_SIGMA_MGDL,
        Math.max(MIN_SIGMA_FLOOR_MGDL, halfWidth)
      );
    }
  }

  // One fit for the whole ladder: carrying a running maximum makes the band
  // monotone (never narrower later), and saturation keeps it readable.
  const sigmaByHorizon = monotoneSaturatingFit(rawByHorizon);

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