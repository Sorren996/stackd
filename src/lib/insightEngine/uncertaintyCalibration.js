// Stackd Insight Engine — Empirical Uncertainty Calibration (Milestone 4)
// Frontend/testable JavaScript mirror of base44/shared/uncertaintyCalibration.ts.
// Both must stay identical.
//
// Calibrates prediction-interval width (sigma) from the user's historical
// out-of-sample forecast errors. When enough evaluated projections exist, the
// half-width at each horizon is fitted from the user's OWN residual quantiles —
// a quantile assumes nothing about the shape of the error distribution.
//
// TWO PROPERTIES THE FIT MUST HAVE, and this file exists to guarantee:
//
//   1. MONOTONE. The band can never be narrower at a later horizon than at an
//      earlier one. Production showed 84 mg/dL at 40 minutes and 18 at 120 —
//      claiming more confidence two hours out than at forty minutes, which the
//      engine cannot know. Raw per-horizon quantiles are therefore carried
//      forward as a running maximum, so a thin or unlucky horizon can never
//      pull the band back in.
//   2. SATURATING. The band grows towards a realistic ceiling (~75 mg/dL
//      half-width) instead of widening without limit or collapsing.
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

import { EVAL_HORIZONS } from "./evaluation";

export const UNCERTAINTY_VERSION = "1.1.0";
export const MIN_SAMPLES_FOR_CALIBRATION = 10;

const MIN_HORIZON_SAMPLES = 3;
const MAX_SIGMA_MGDL = 95;
const MIN_SIGMA_FLOOR_MGDL = 5;

// The realistic ceiling for a half-width: past this, more band is not more
// honest, it is unreadable. Inside the knee the fitted width is used as-is;
// beyond it the width approaches the ceiling smoothly.
export const UNCERTAINTY_CEILING_MGDL = 75;
const SATURATION_KNEE_MGDL = 45;

// The interval the band claims to be: four times in five, the reading lands
// inside it.
export const NOMINAL_BAND_COVERAGE = 0.8;

export function saturateHalfWidth(rawMgdl) {
  if (!(rawMgdl > 0)) return 0;
  if (rawMgdl <= SATURATION_KNEE_MGDL) return rawMgdl;
  const room = UNCERTAINTY_CEILING_MGDL - SATURATION_KNEE_MGDL;
  return SATURATION_KNEE_MGDL + room * (1 - Math.exp(-(rawMgdl - SATURATION_KNEE_MGDL) / room));
}

// Carry each horizon's fitted width forward as a running maximum, then saturate.
// A horizon with no samples of its own inherits the width measured before it, so
// the interpolation between horizons can never step back down.
export function monotoneSaturatingFit(rawByHorizon) {
  const out = {};
  let carried = 0;
  const horizons = [...EVAL_HORIZONS].sort((a, b) => a - b);
  for (const h of horizons) {
    const raw = rawByHorizon[h];
    if (Number.isFinite(raw)) carried = Math.max(carried, raw);
    if (!(carried > 0)) continue;
    const width = Math.max(MIN_SIGMA_FLOOR_MGDL, saturateHalfWidth(carried));
    out[h] = Math.round(width * 10) / 10;
  }
  return out;
}

function quantile(values, q) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function median(values) {
  return quantile(values, 0.5);
}

export function calibrateUncertainty(evaluatedProjections) {
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

  const rawByHorizon = {};
  const horizonSampleCounts = {};

  for (const h of EVAL_HORIZONS) {
    const residuals = [];
    for (const p of valid) {
      const horizonScores = (p.evaluation.horizons || []).filter(
        (s) => s.horizon_min === h && s.scored && s.abs_error != null
      );
      for (const s of horizonScores) {
        const signed = Number(s.error);
        residuals.push(Number.isFinite(signed) ? signed : s.abs_error);
      }
    }
    horizonSampleCounts[h] = residuals.length;
    if (residuals.length >= MIN_HORIZON_SAMPLES) {
      const centre = median(residuals);
      const halfWidth = quantile(residuals.map((r) => Math.abs(r - centre)), NOMINAL_BAND_COVERAGE);
      rawByHorizon[h] = Math.min(MAX_SIGMA_MGDL, Math.max(MIN_SIGMA_FLOOR_MGDL, halfWidth));
    }
  }

  // Fitted once, monotonically, saturating — never per-horizon in isolation.
  const sigmaByHorizon = monotoneSaturatingFit(rawByHorizon);

  const withIntervals = valid.filter(
    (p) => p.evaluation.coverage != null && (p.evaluation.horizons || []).some((s) => s.scored && s.in_interval !== null)
  );

  let coverageObserved = null;
  let coverageSampleCount = 0;

  if (withIntervals.length >= MIN_HORIZON_SAMPLES) {
    const allIntervalChecks = [];
    for (const p of withIntervals) {
      for (const s of (p.evaluation.horizons || [])) {
        if (s.scored && s.in_interval !== null) {
          allIntervalChecks.push(s.in_interval);
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

export function getEmpiricalSigma(minOffset, calibration) {
  if (!calibration.calibrated || Object.keys(calibration.sigmaByHorizon).length === 0) {
    return null;
  }
  const horizons = Object.keys(calibration.sigmaByHorizon).map(Number).sort((a, b) => a - b);
  if (minOffset <= horizons[0]) return calibration.sigmaByHorizon[horizons[0]];
  if (minOffset >= horizons[horizons.length - 1]) return calibration.sigmaByHorizon[horizons[horizons.length - 1]];
  for (let i = 0; i < horizons.length - 1; i++) {
    const h0 = horizons[i];
    const h1 = horizons[i + 1];
    if (minOffset >= h0 && minOffset <= h1) {
      const s0 = calibration.sigmaByHorizon[h0];
      const s1 = calibration.sigmaByHorizon[h1];
      const frac = (minOffset - h0) / (h1 - h0);
      // Interpolating between monotone values is monotone, so a later offset can
      // never return a narrower band than an earlier one.
      return Math.round((s0 + (s1 - s0) * frac) * 10) / 10;
    }
  }
  return null;
}